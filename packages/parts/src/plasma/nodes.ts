import {
  DataTexture,
  FloatType,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { float, floor, mod, texture as textureNode, uniform, uv, vec2 } from 'three/tsl';
import {
  type RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  QuadMesh,
  type WebGPURenderer,
} from 'three/webgpu';
import { buildLsini4, buildLsini16, buildPsini } from './tables.js';

/** Field logical resolution — the original mode-X plasma grid (tunable). */
export const PLASMA_W = 320;
export const PLASMA_H = 280;

/** Original plzline loop ranges (ASMYT.ASM IRP ccc = 0..83 → 84 cols; PLZ.C MAXY = 280 lines). */
export const PLASMA_COLS = 84;
export const PLASMA_LINES = 280;

/** Wrap a single-channel float table into an Nx1 data texture (NearestFilter, raw values via .r). */
function tableTexture(values: ArrayLike<number>): DataTexture {
  const data = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) data[i] = values[i] ?? 0;
  const tex = new DataTexture(data, values.length, 1, RedFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The plasma field + palette pass, reproducing ASMYT.ASM `plzline` over column `ccc` (0..83) and
 * line `yy` (0..279). Per pixel: idx = psini[8·ccc + lsini16[yy−4·ccc+p2+320] + p1] +
 * psini[2·yy − 4·ccc + lsini4[yy+16·ccc+p4] + p3 + 320], all masked to each table's size; idx (mod
 * 256) indexes the 256-entry palette LUT, rebuilt each frame by the Effect. The diagonal lsini
 * indices are what give the field its smooth diagonal flow.
 */
export class PlasmaField {
  private readonly psini = tableTexture(buildPsini());
  private readonly lsini4 = tableTexture(buildLsini4());
  private readonly lsini16 = tableTexture(buildLsini16());
  private readonly lut: DataTexture;
  private readonly p1 = uniform(3500);
  private readonly p2 = uniform(2300);
  private readonly p3 = uniform(3900);
  private readonly p4 = uniform(3670);
  // The second, scanline-interlaced parameter set (l1..l4).
  private readonly pl1 = uniform(1000);
  private readonly pl2 = uniform(2000);
  private readonly pl3 = uniform(3000);
  private readonly pl4 = uniform(4000);
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor() {
    // 256×1 palette LUT; bytes are literal VGA DAC values (6-bit→8-bit ×4). Tag sRGB so the
    // sample-decode cancels the output sRGB-encode and the bytes land verbatim (Techno's lesson).
    this.lut = new DataTexture(new Uint8Array(256 * 4), 256, 1, RGBAFormat, UnsignedByteType);
    this.lut.minFilter = NearestFilter;
    this.lut.magFilter = NearestFilter;
    this.lut.colorSpace = SRGBColorSpace;
    this.lut.needsUpdate = true;

    // Fetch table[i]: NearestFilter sample at ((i+0.5)/N, 0.5) → table[floor(i)].
    const fetch = (tex: DataTexture, i: ReturnType<typeof float>, n: number) =>
      textureNode(tex, vec2(i.add(float(0.5)).div(n), 0.5)).r;

    // Mirror the original rasterizer (ASMYT.ASM plzline) loop variables: ccc = column, yy = line.
    // The PLZSINI macro in PLZ.C is stale reference code; the shipped self-modifying addressing uses
    // small column strides and DIAGONAL lsini indices — that is what makes the field flow diagonally
    // and stay smooth (the macro's x·32 was ~16× too fast and produced vertical streaks).
    // Continuous (un-floored) so modern mode is smooth; authentic chunkiness comes from the
    // NearestFilter upscale of the 320×280 field target, not from quantising the field here.
    const ccc = uv().x.mul(PLASMA_COLS);
    const yy = uv().y.mul(PLASMA_LINES);
    // The 8-bit field index for ONE parameter set (q1..q4). Exact setplzparas (ASMYT.ASM) arithmetic;
    // lsini16/lsini4 are PRE-SCALED (×16/×8) so they add straight in; the +320 constants are
    // setplzparas's OFFSET +80*8 (lsini16, word) / +80*4 (psini, byte). A multiple of the table size
    // keeps each mod argument non-negative.
    //   l16 = lsini16[yy − 4·ccc + q2 + 320] ;  l4 = lsini4[yy + 16·ccc + q4]
    //   a1  = 8·ccc + l16 + q1              ;  a2 = 2·yy − 4·ccc + l4 + q3 + 320
    type Node = ReturnType<typeof uniform>;
    const fieldIdx = (q1: Node, q2: Node, q3: Node, q4: Node) => {
      const l16 = fetch(
        this.lsini16,
        mod(
          yy
            .sub(ccc.mul(4))
            .add(q2)
            .add(320 + 8192),
          8192,
        ),
        8192,
      );
      const l4 = fetch(this.lsini4, mod(yy.add(ccc.mul(16)).add(q4), 8192), 8192);
      const a1 = mod(ccc.mul(8).add(l16).add(q1), 16384);
      const a2 = mod(
        yy
          .mul(2)
          .sub(ccc.mul(4))
          .add(l4)
          .add(q3)
          .add(320 + 16384),
        16384,
      );
      return mod(fetch(this.psini, a1, 16384).add(fetch(this.psini, a2, 16384)), 256);
    };
    // Original scanline interlace (PLZ.C plz(): SC plane masks 0x0A/0x05 over even/odd line passes):
    // the k or l parameter set is chosen per pixel — k when (x+y) is odd, l when even. The two sets
    // diverge over time (different moveplz rates), so this dithers two phases of the field. Modern's
    // Linear upscale blends the checkerboard (the CRT look); authentic keeps it crisp.
    const idxK = fieldIdx(this.p1, this.p2, this.p3, this.p4);
    const idxL = fieldIdx(this.pl1, this.pl2, this.pl3, this.pl4);
    const parity = mod(floor(uv().x.mul(PLASMA_W)).add(floor(uv().y.mul(PLASMA_H))), 2);
    const idx = idxL.mul(parity.oneMinus()).add(idxK.mul(parity));

    this.material.colorNode = textureNode(this.lut, vec2(idx.add(float(0.5)).div(256), 0.5));
    this.quad = new QuadMesh(this.material);
  }

  /** Upload a fresh 256×RGB palette (values 0..63) as the LUT for this frame. */
  setPalette(rgb: Uint8Array): void {
    const data = this.lut.image.data as Uint8Array;
    for (let i = 0; i < 256; i++) {
      data[i * 4] = (rgb[i * 3] ?? 0) * 4;
      data[i * 4 + 1] = (rgb[i * 3 + 1] ?? 0) * 4;
      data[i * 4 + 2] = (rgb[i * 3 + 2] ?? 0) * 4;
      data[i * 4 + 3] = 255;
    }
    this.lut.needsUpdate = true;
  }

  /** Set the k and l (scanline-interlaced) phase param sets for this frame. */
  setPhase(
    k: readonly [number, number, number, number],
    l: readonly [number, number, number, number],
  ): void {
    this.p1.value = k[0];
    this.p2.value = k[1];
    this.p3.value = k[2];
    this.p4.value = k[3];
    this.pl1.value = l[0];
    this.pl2.value = l[1];
    this.pl3.value = l[2];
    this.pl4.value = l[3];
  }

  /** Render the plasma into the (320×280) field target. */
  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.psini.dispose();
    this.lsini4.dispose();
    this.lsini16.dispose();
    this.lut.dispose();
    this.material.dispose();
  }
}

import {
  DataTexture,
  FloatType,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { float, floor, mix, mod, texture as textureNode, uniform, uv, vec2 } from 'three/tsl';
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

/**
 * Width of the 2D lookup-table textures. The tables reach 16384 entries, which exceeds the max
 * texture width on some WebGL2 implementations (Firefox → texStorage "unsupported size" → the plasma
 * field renders blank). Storing them as TABLE_W-wide 2D textures keeps every dimension small.
 */
const TABLE_W = 256;

/** Wrap a single-channel float table into a TABLE_W-wide 2D data texture (row-major, raw via .r). */
function tableTexture(values: ArrayLike<number>): DataTexture {
  const height = Math.ceil(values.length / TABLE_W);
  const data = new Float32Array(TABLE_W * height); // padded with 0
  for (let i = 0; i < values.length; i++) data[i] = values[i] ?? 0;
  const tex = new DataTexture(data, TABLE_W, height, RedFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a 256×1 palette LUT from VGA DAC values (0..63 → ×4). Tagged sRGB so the sample-decode cancels
 * the output sRGB-encode and the bytes land verbatim. IMPORTANT: this is a single upload-with-data — it
 * is NOT mutated/re-uploaded per frame. three's WebGL backend doesn't reliably re-upload a mutated
 * DataTexture (the palette froze → wrong colours/black on WebGL2/Firefox), so the per-frame cross-fade
 * is done in the shader (two of these LUTs + a fade uniform); these textures change only per section.
 */
function paletteTexture(rgb?: Uint8Array): DataTexture {
  const data = new Uint8Array(256 * 4);
  if (rgb) {
    for (let i = 0; i < 256; i++) {
      data[i * 4] = (rgb[i * 3] ?? 0) * 4;
      data[i * 4 + 1] = (rgb[i * 3 + 1] ?? 0) * 4;
      data[i * 4 + 2] = (rgb[i * 3 + 2] ?? 0) * 4;
      data[i * 4 + 3] = 255;
    }
  }
  const tex = new DataTexture(data, 256, 1, RGBAFormat, UnsignedByteType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.colorSpace = SRGBColorSpace;
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
  // Two palette LUTs cross-faded in the shader by `fadeU` (0 = from, 1 = to). They are swapped only at
  // section boundaries — never mutated per frame — so WebGL2 renders them reliably (see paletteTexture).
  private lutFrom = paletteTexture();
  private lutTo = paletteTexture();
  private readonly lutFromSample: ReturnType<typeof textureNode>;
  private readonly lutToSample: ReturnType<typeof textureNode>;
  private readonly fadeU = uniform(1);
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
    // Fetch table[i] from its TABLE_W-wide 2D layout (row-major): round i to the nearest entry (as the
    // old 1×N NearestFilter did), then x = i mod TABLE_W, y = i / TABLE_W → exact texel (x,y) = table[i].
    const fetch = (tex: DataTexture, i: ReturnType<typeof float>, n: number) => {
      const h = Math.ceil(n / TABLE_W);
      const ii = floor(i.add(float(0.5)));
      const x = mod(ii, TABLE_W);
      const y = floor(ii.div(TABLE_W));
      return textureNode(tex, vec2(x.add(float(0.5)).div(TABLE_W), y.add(float(0.5)).div(h))).r;
    };

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

    // Cross-fade the two palette LUTs in the shader (fadeU 0..1); the per-frame change is the uniform,
    // not a texture re-upload — which is what keeps WebGL2/Firefox correct.
    const lutUv = vec2(idx.add(float(0.5)).div(256), 0.5);
    this.lutFromSample = textureNode(this.lutFrom, lutUv);
    this.lutToSample = textureNode(this.lutTo, lutUv);
    this.material.colorNode = mix(this.lutFromSample, this.lutToSample, this.fadeU);
    this.quad = new QuadMesh(this.material);
  }

  /** Swap in the `from`→`to` palette pair (values 0..63) for a section. Called only on section change. */
  setPalettes(from: Uint8Array, to: Uint8Array): void {
    const oldFrom = this.lutFrom;
    const oldTo = this.lutTo;
    this.lutFrom = paletteTexture(from);
    this.lutTo = paletteTexture(to);
    this.lutFromSample.value = this.lutFrom;
    this.lutToSample.value = this.lutTo;
    oldFrom.dispose();
    oldTo.dispose();
  }

  /** Set the cross-fade position between the two palettes (0 = from, 1 = to). Called per frame. */
  setFade(t: number): void {
    this.fadeU.value = t;
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
    this.lutFrom.dispose();
    this.lutTo.dispose();
    this.material.dispose();
  }
}

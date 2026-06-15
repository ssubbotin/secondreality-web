import {
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
  Vector2,
} from 'three';
import { texture as textureNode, uniform, uv, vec2 } from 'three/tsl';
import {
  type RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  QuadMesh,
  type WebGPURenderer,
} from 'three/webgpu';
import { buildRotozoomPalette, ROTO_PALETTE_SIZE } from './palette.js';

/** Field grid = the original mode (ASM.ASM ZOOMXW/ZOOMYW ≈ 320×200). */
export const ROTO_W = 320;
export const ROTO_H = 200;

/**
 * Affine warp + index→palette pass. Per pixel: texel = startUV + col·colStep + row·rowStep (col=uv.x·ROTO_W,
 * row=uv.y·ROTO_H); the tiling index texture (RepeatWrapping handles the mod-256 wrap) yields a palette
 * INDEX (0..63), mapped through the vivid LUT and scaled by the brightness fade. The CPU sets the basis
 * uniforms each frame (see affine.ts). The original's colour is the palette over the index gradient.
 */
export class RotozoomLayer {
  private readonly startUV = uniform(new Vector2());
  private readonly colStep = uniform(new Vector2());
  private readonly rowStep = uniform(new Vector2());
  private readonly fade = uniform(1);
  private readonly lut: DataTexture;
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor(indexTexture: Texture) {
    // 64×1 vivid palette LUT (sRGB so the bytes land verbatim, Linear so modern mode blends entries).
    const pal = buildRotozoomPalette();
    const data = new Uint8Array(ROTO_PALETTE_SIZE * 4);
    for (let i = 0; i < ROTO_PALETTE_SIZE; i++) {
      data[i * 4] = pal[i * 3] ?? 0;
      data[i * 4 + 1] = pal[i * 3 + 1] ?? 0;
      data[i * 4 + 2] = pal[i * 3 + 2] ?? 0;
      data[i * 4 + 3] = 255;
    }
    this.lut = new DataTexture(data, ROTO_PALETTE_SIZE, 1, RGBAFormat, UnsignedByteType);
    this.lut.minFilter = LinearFilter;
    this.lut.magFilter = LinearFilter;
    this.lut.colorSpace = SRGBColorSpace;
    this.lut.needsUpdate = true;

    const col = uv().x.mul(ROTO_W);
    const row = uv().y.mul(ROTO_H);
    // texel coordinate (0..256 texels, wrapping); /256 → normalised UV, RepeatWrapping wraps.
    const texel = this.startUV.add(this.colStep.mul(col)).add(this.rowStep.mul(row));
    // index texture stores the raw 0..63 index in R (NoColorSpace upstream); ·255 recovers the index.
    const idx = textureNode(indexTexture, texel.div(256)).r.mul(255);
    const color = textureNode(this.lut, vec2(idx.add(0.5).div(ROTO_PALETTE_SIZE), 0.5));
    this.material.colorNode = color.mul(this.fade);
    this.quad = new QuadMesh(this.material);
  }

  /** Set the affine basis (from affineBasis) for this frame. */
  setBasis(
    startUV: readonly [number, number],
    colStep: readonly [number, number],
    rowStep: readonly [number, number],
  ): void {
    this.startUV.value.set(startUV[0], startUV[1]);
    this.colStep.value.set(colStep[0], colStep[1]);
    this.rowStep.value.set(rowStep[0], rowStep[1]);
  }

  /** Set the brightness fade (0..1) for this frame. */
  setFade(f: number): void {
    this.fade.value = f;
  }

  /** Render the warp into the field target. */
  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.lut.dispose();
    this.material.dispose();
  }
}

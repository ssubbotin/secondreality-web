import { type Texture, Vector2 } from 'three';
import { texture as textureNode, uniform, uv } from 'three/tsl';
import {
  type RenderTarget as GpuRenderTarget,
  MeshBasicNodeMaterial,
  QuadMesh,
  type WebGPURenderer,
} from 'three/webgpu';

/** Field grid = the original mode (ASM.ASM ZOOMXW/ZOOMYW ≈ 320×200). */
export const ROTO_W = 320;
export const ROTO_H = 200;

/**
 * Affine warp + sample pass. Per pixel: texel = startUV + col·colStep + row·rowStep (col=uv.x·ROTO_W,
 * row=uv.y·ROTO_H), sampled from the tiling 256×256 texture (RepeatWrapping handles the mod-256 wrap),
 * scaled by the brightness fade. The CPU sets the basis uniforms each frame (see affine.ts).
 */
export class RotozoomLayer {
  private readonly startUV = uniform(new Vector2());
  private readonly colStep = uniform(new Vector2());
  private readonly rowStep = uniform(new Vector2());
  private readonly fade = uniform(1);
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad: QuadMesh;

  constructor(picture: Texture) {
    const col = uv().x.mul(ROTO_W);
    const row = uv().y.mul(ROTO_H);
    // texel coordinate (in 0..256 texels, wrapping); divide by 256 → normalised UV, RepeatWrapping wraps.
    const texel = this.startUV.add(this.colStep.mul(col)).add(this.rowStep.mul(row));
    const sample = textureNode(picture, texel.div(256));
    this.material.colorNode = sample.mul(this.fade);
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
    this.material.dispose();
  }
}

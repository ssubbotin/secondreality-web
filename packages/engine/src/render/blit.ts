import type { Texture } from 'three';
import { texture as textureNode, uv } from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';

/**
 * Fullscreen blit: presents a source texture to the renderer's current output target (the canvas
 * when the render target is null). Reused by the lab/host to show an effect's off-screen
 * RenderTarget. `QuadMesh` carries its own orthographic camera and renders a single screen-filling
 * triangle, so no scene/camera plumbing is needed.
 */
export class Blit {
  private readonly material = new MeshBasicNodeMaterial();
  private readonly quad = new QuadMesh(this.material);
  private source: Texture | null = null;

  setSource(tex: Texture): void {
    this.source = tex;
    this.material.colorNode = textureNode(tex, uv());
    this.material.needsUpdate = true;
  }

  /** Render the source texture to the renderer's current output target. */
  render(renderer: WebGPURenderer): void {
    if (!this.source) return;
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
  }
}

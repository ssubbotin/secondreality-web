import { Blit } from '@sr/engine';
import {
  DataTexture,
  type MagnificationTextureFilter,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import type { RenderTarget as GpuRenderTarget, WebGPURenderer } from 'three/webgpu';
import { SCREEN_H, SCREEN_W } from './pos.js';

/**
 * FOREST raster surface: maps the composited 320×200 8-bit index buffer through the picture's 6-bit VGA
 * palette (×4) into an RGBA `DataTexture` and blits it to the supplied target — the proven
 * `PictureSurface` / dot-tunnel `RasterSurface` pattern. The texture is tagged sRGB so the DAC bytes land
 * verbatim; rows are flipped on write because the index buffer is top-row-first while three's uv origin is
 * bottom-left. `setFilter` toggles the authentic (chunky `NearestFilter`) vs modern (smooth
 * `LinearFilter`) upscale.
 */
export class ForestSurface {
  private readonly palette6 = new Uint8Array(256 * 3);
  private readonly rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  private readonly tex: DataTexture;
  private readonly blit = new Blit();

  constructor(palette6: Uint8Array) {
    this.palette6.set(palette6.subarray(0, this.palette6.length));
    this.tex = new DataTexture(this.rgba, SCREEN_W, SCREEN_H, RGBAFormat, UnsignedByteType);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.minFilter = NearestFilter;
    this.tex.magFilter = NearestFilter;
    this.tex.needsUpdate = true;
    this.blit.setSource(this.tex);
  }

  /** authentic = chunky NearestFilter; modern = smooth LinearFilter. */
  setFilter(filter: MagnificationTextureFilter): void {
    this.tex.minFilter = filter;
    this.tex.magFilter = filter;
    this.tex.needsUpdate = true;
  }

  /** Map the 320×200 index buffer through the 6-bit palette (×4) into the sRGB RGBA texture (flipped). */
  update(index: Uint8Array): void {
    const { rgba, palette6 } = this;
    for (let row = 0; row < SCREEN_H; row++) {
      const src = row * SCREEN_W;
      const dst = row * SCREEN_W;
      for (let col = 0; col < SCREEN_W; col++) {
        const c = index[src + col] ?? 0;
        const d = (dst + col) * 4;
        rgba[d] = (palette6[c * 3] ?? 0) << 2;
        rgba[d + 1] = (palette6[c * 3 + 1] ?? 0) << 2;
        rgba[d + 2] = (palette6[c * 3 + 2] ?? 0) << 2;
        rgba[d + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
  }

  /** Read the expanded sRGB RGBA at (col, row) from the top-left origin (for tests / debug). */
  pixelAt(col: number, row: number): [number, number, number, number] {
    const d = (row * SCREEN_W + col) * 4;
    return [this.rgba[d] ?? 0, this.rgba[d + 1] ?? 0, this.rgba[d + 2] ?? 0, this.rgba[d + 3] ?? 0];
  }

  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    this.blit.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.tex.dispose();
    this.blit.dispose();
  }
}

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
import { SCREEN_H, SCREEN_W } from './copper.js';

/**
 * Maps the 320×200 palette-index buffer through a 6-bit VGA palette (×4 to 8-bit) into an RGBA DataTexture
 * and blits it into the supplied target. The palette is fixed per part (the credit colours), but the index
 * buffer changes every frame as the credits scroll. The texture is tagged sRGB so the VGA DAC bytes land
 * verbatim; rows are flipped on write because the index buffer is top-row-first while three's uv origin is
 * bottom-left. Mirrors the alku1/forest `RasterSurface`.
 */
export class RasterSurface {
  private readonly rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  private readonly tex: DataTexture;
  private readonly blit = new Blit();
  private palette: Uint8Array;

  constructor(palette: Uint8Array) {
    this.palette = palette;
    this.tex = new DataTexture(this.rgba, SCREEN_W, SCREEN_H, RGBAFormat, UnsignedByteType);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.minFilter = NearestFilter;
    this.tex.magFilter = NearestFilter;
    this.tex.needsUpdate = true;
    this.blit.setSource(this.tex);
  }

  setFilter(filter: MagnificationTextureFilter): void {
    this.tex.minFilter = filter;
    this.tex.magFilter = filter;
    this.tex.needsUpdate = true;
  }

  setPalette(palette: Uint8Array): void {
    this.palette = palette;
  }

  /** Resolve the index buffer through the current palette into the RGBA texture (row-flipped). */
  update(index: Uint8Array): void {
    const pal = this.palette;
    for (let row = 0; row < SCREEN_H; row++) {
      const src = row * SCREEN_W;
      const dst = (SCREEN_H - 1 - row) * SCREEN_W; // flip vertically
      for (let col = 0; col < SCREEN_W; col++) {
        const c = index[src + col] ?? 0;
        const d = (dst + col) * 4;
        this.rgba[d] = (pal[c * 3] ?? 0) * 4;
        this.rgba[d + 1] = (pal[c * 3 + 1] ?? 0) * 4;
        this.rgba[d + 2] = (pal[c * 3 + 2] ?? 0) * 4;
        this.rgba[d + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
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

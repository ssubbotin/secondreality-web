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
import { SCREEN_H, SCREEN_W } from './wat-data.js';

/**
 * Authentic surface: maps the 320×200 palette-index buffer through the 6-bit VGA palette (×4) into an
 * RGBA `DataTexture` and blits it to the supplied target — the same proven cross-backend path TECHNO /
 * dot-tunnel use. The texture is tagged sRGB so the DAC bytes land verbatim; rows are flipped on write
 * because the index buffer is top-row-first while three's uv origin is bottom-left.
 *
 * `authentic` look = `NearestFilter` (chunky mode-X upscale); `modern` (default) = `LinearFilter`
 * (smooth upscale of the same field). Both render the identical CPU-rastered 320×200 frame.
 */
export class WaterSurface {
  private readonly rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  private readonly tex: DataTexture;
  private readonly blit = new Blit();
  private readonly palette: Uint8Array;

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

  /** Upload a 320×200 8-bit palette-index frame through the 6-bit→8-bit (×4) VGA palette. */
  update(index: Uint8Array): void {
    for (let row = 0; row < SCREEN_H; row++) {
      const src = row * SCREEN_W;
      const dst = row * SCREEN_W;
      for (let col = 0; col < SCREEN_W; col++) {
        const c = index[src + col] ?? 0;
        const d = (dst + col) * 4;
        this.rgba[d] = (this.palette[c * 3] ?? 0) * 4;
        this.rgba[d + 1] = (this.palette[c * 3 + 1] ?? 0) * 4;
        this.rgba[d + 2] = (this.palette[c * 3 + 2] ?? 0) * 4;
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

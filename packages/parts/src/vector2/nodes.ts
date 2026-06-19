/**
 * GPU surface for the vector2 city. The CPU pipeline (renderer.ts) rasterises the flat-shaded city into a
 * 320×200 palette-index buffer; `RasterSurface` maps that buffer through the U2E palette into an sRGB
 * DataTexture and blits it to the supplied target. The authentic↔modern look is the upscale filter only
 * (NearestFilter = chunky mode-X, LinearFilter = smooth) — the same discipline glenz/dot-tunnel use, so
 * both modes share the verbatim CPU raster. A true GPU-geometry modern renderer is deferred (see STATUS).
 */

import { Blit } from '@sr/engine';
import {
  Color,
  DataTexture,
  type MagnificationTextureFilter,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import type { RenderTarget as GpuRenderTarget, WebGPURenderer } from 'three/webgpu';
import { paletteToRgba } from './palette.js';
import { SCREEN_H, SCREEN_W } from './raster.js';

const BLACK = new Color(0, 0, 0);

/** Authentic/modern blit: 320×200 index buffer → palette LUT → sRGB DataTexture → fullscreen quad. */
export class RasterSurface {
  private readonly rgba = new Uint8Array(SCREEN_W * SCREEN_H * 4);
  private readonly tex: DataTexture;
  private readonly blit = new Blit();
  private readonly lut: Uint8Array;

  constructor(palette: Uint8Array) {
    this.lut = paletteToRgba(palette);
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

  /** Upload a fresh index buffer (rows flipped: index buffer is top-first, three's uv origin is bottom). */
  update(index: Uint8Array): void {
    for (let row = 0; row < SCREEN_H; row++) {
      const src = row * SCREEN_W;
      const dst = (SCREEN_H - 1 - row) * SCREEN_W;
      for (let col = 0; col < SCREEN_W; col++) {
        const c = (index[src + col] ?? 0) * 4;
        const d = (dst + col) * 4;
        this.rgba[d] = this.lut[c] ?? 0;
        this.rgba[d + 1] = this.lut[c + 1] ?? 0;
        this.rgba[d + 2] = this.lut[c + 2] ?? 0;
        this.rgba[d + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
  }

  render(renderer: WebGPURenderer, target: GpuRenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.setClearColor(BLACK, 1);
    renderer.clear();
    this.blit.render(renderer);
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.tex.dispose();
    this.blit.dispose();
  }
}

export { SCREEN_H, SCREEN_W };

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
import { SCREEN_H, SCREEN_W } from './backdrop.js';

/**
 * Maps the 320×200 palette-index buffer through a live 6-bit VGA palette (×4 to 8-bit) into an RGBA
 * DataTexture and blits it to the supplied target. The palette is mutated per frame (the title-reveal
 * `dofade` lives in the palette), so both the index buffer and the palette can change each frame. The
 * texture is tagged sRGB so the VGA DAC bytes land verbatim; rows are written top-first (DataTexture row 0
 * → screen top), matching the host blit's orientation. authentic = chunky NearestFilter; modern = smooth
 * LinearFilter.
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

  /** Resolve the index buffer through the current palette into the RGBA texture (top-row-first). */
  update(index: Uint8Array): void {
    const pal = this.palette;
    for (let row = 0; row < SCREEN_H; row++) {
      const base = row * SCREEN_W;
      for (let col = 0; col < SCREEN_W; col++) {
        const c = index[base + col] ?? 0;
        const d = (base + col) * 4;
        this.rgba[d] = (pal[c * 3] ?? 0) << 2;
        this.rgba[d + 1] = (pal[c * 3 + 1] ?? 0) << 2;
        this.rgba[d + 2] = (pal[c * 3 + 2] ?? 0) << 2;
        this.rgba[d + 3] = 255;
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

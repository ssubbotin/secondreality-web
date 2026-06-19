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
import { FIELD_H, FIELD_W } from './raster.js';

/**
 * Authentic/modern surface for the voxel field: maps the FIELD_W×FIELD_H (160×200) palette-index buffer
 * through the 6-bit VGA palette (×4) into an RGBA DataTexture and blits it to the supplied target. The
 * DataTexture is tagged sRGB so the bytes land verbatim; rows are flipped on write because the index
 * buffer is top-row-first while three's uv origin is bottom-left.
 *
 * The look toggles via the upscale filter: authentic = chunky NearestFilter (the original mode-X
 * horizontal pixel-doubling + nearest upscale to the viewport), modern = smooth LinearFilter. This is
 * the same cross-backend-proven path the dot-tunnel port settled on (a GPU heightfield raymarch is
 * parked for the shared post chain — see STATUS).
 *
 * NOTE: the texture is mutated + re-uploaded (`needsUpdate`) every frame — if a WebGL2/Firefox driver
 * freezes the upload (as the plasma palette LUT did), fall back to recreating the DataTexture each
 * frame. Verify in the lab on Firefox.
 */
export class RasterSurface {
  private readonly rgba = new Uint8Array(FIELD_W * FIELD_H * 4);
  private readonly tex: DataTexture;
  private readonly blit = new Blit();
  private readonly palette: Uint8Array;

  constructor(palette: Uint8Array) {
    this.palette = palette;
    this.tex = new DataTexture(this.rgba, FIELD_W, FIELD_H, RGBAFormat, UnsignedByteType);
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

  update(index: Uint8Array): void {
    for (let row = 0; row < FIELD_H; row++) {
      const src = row * FIELD_W;
      const dst = row * FIELD_W;
      for (let col = 0; col < FIELD_W; col++) {
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

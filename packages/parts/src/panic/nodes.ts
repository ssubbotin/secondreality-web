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
import { fadeVgaPalette, paletteLut } from './palette.js';
import { MONSTER_H, MONSTER_W } from './picture.js';

/**
 * Authentic↔modern blit surface for PANIC. Maps the 320×200 palette-index buffer through the MONSTER
 * palette (faded toward white by the crash's `fadeA`, reproducing SHUTDOWN.C's `fadepals` swap) into an
 * sRGB RGBA `DataTexture` and blits it to the supplied target. The texture is tagged `SRGBColorSpace`
 * so the 6-bit→8-bit (×4) bytes land verbatim; rows are flipped on write (index buffer is top-row-first
 * while three's uv origin is bottom-left). `setFilter` toggles the chunky (authentic, NearestFilter)
 * vs smooth (modern, LinearFilter) upscale. Mirrors dot-tunnel's RasterSurface.
 *
 * The palette fade is applied by rebuilding the 256-entry LUT only when `fadeA` changes, keeping the
 * per-frame work to the index→RGBA expansion. The whole texture is mutated and re-uploaded each frame
 * (`needsUpdate`); if a WebGL2 driver freezes the upload (as plasma's LUT once did), recreate the
 * DataTexture per frame instead — verify in the lab on Firefox.
 */
export class CrashSurface {
  private readonly rgba = new Uint8Array(MONSTER_W * MONSTER_H * 4);
  private readonly tex: DataTexture;
  private readonly blit = new Blit();
  private readonly palette: Uint8Array;
  private lut: Uint8Array;
  private lutFadeA = -1;

  constructor(palette: Uint8Array) {
    this.palette = palette;
    this.lut = paletteLut(palette);
    this.tex = new DataTexture(this.rgba, MONSTER_W, MONSTER_H, RGBAFormat, UnsignedByteType);
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

  /** Expand `index` through the (faded) palette LUT into the sRGB texture, flipping rows vertically. */
  update(index: Uint8Array, fadeA: number): void {
    if (fadeA !== this.lutFadeA) {
      this.lut =
        fadeA <= 0 ? paletteLut(this.palette) : paletteLut(fadeVgaPalette(this.palette, fadeA));
      this.lutFadeA = fadeA;
    }
    const lut = this.lut;
    for (let row = 0; row < MONSTER_H; row++) {
      const src = row * MONSTER_W;
      const dst = (MONSTER_H - 1 - row) * MONSTER_W; // flip vertically
      for (let col = 0; col < MONSTER_W; col++) {
        const c = (index[src + col] ?? 0) * 4;
        const d = (dst + col) * 4;
        this.rgba[d] = lut[c] ?? 0;
        this.rgba[d + 1] = lut[c + 1] ?? 0;
        this.rgba[d + 2] = lut[c + 2] ?? 0;
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

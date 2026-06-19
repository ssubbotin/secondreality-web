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
import { type RMatrix, UNIT } from './fixed.js';
import { SCREEN_H, SCREEN_W } from './scene.js';

/**
 * Authentic surface: maps the 320x200 palette-index buffer through the 6-bit VGA palette (x4) into an RGBA
 * DataTexture and blits it to the supplied target (the dot-tunnel/glenz RasterSurface pattern). sRGB-tagged
 * so the DAC bytes land verbatim. Rows are written straight through (dst row = index row): the index buffer
 * is top-row-first and so is the DataTexture's row 0 (matching the orientation fix — no vertical flip).
 * NearestFilter = chunky mode-X, LinearFilter = smoothed.
 */
export class RasterSurface {
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

/**
 * Convert an engine view-space matrix (rows m[0..8] scaled by UNIT, translation x/y/z) to a three.js
 * column-major 16-element model matrix, applying the (1,-1,-1) engine->three flip (engine view space is
 * x-right / y-down / z-into-screen; three is x-right / y-up / z-toward-camera). Pure; unit-tested. Kept for
 * the GPU-mesh experiments; the shipped renderer uses the CPU raster for both modes (see RasterSurface).
 */
export function engineToViewMatrix(r: RMatrix): number[] {
  const s = 1 / UNIT;
  const m = r.m;
  // Row-major affine rows (with rows 1,2 negated and translation Y/Z negated):
  //   [ m0  m1  m2 | x ]
  //   [-m3 -m4 -m5 |-y ]
  //   [-m6 -m7 -m8 |-z ]
  // three.Matrix4.set takes row-major; .elements stores column-major. Return column-major directly.
  return [
    (m[0] ?? 0) * s,
    -((m[3] ?? 0) * s),
    -((m[6] ?? 0) * s),
    0,
    (m[1] ?? 0) * s,
    -((m[4] ?? 0) * s),
    -((m[7] ?? 0) * s),
    0,
    (m[2] ?? 0) * s,
    -((m[5] ?? 0) * s),
    -((m[8] ?? 0) * s),
    0,
    r.x,
    -r.y,
    -r.z,
    1,
  ];
}

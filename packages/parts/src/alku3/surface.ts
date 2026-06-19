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

/**
 * The ALKU picture-reveal blit. Maps a decoded width×height palette-index buffer through a **live 6-bit
 * VGA palette** (expanded ×4 to 8-bit) into an RGBA `DataTexture` and blits it to the supplied target.
 * The palette is held separately and re-applied whenever it changes, so the 128-step reveal fade (and the
 * 64-step closing fade) drive a fresh 6-bit palette every frame without re-decoding pixels — the proven
 * ENDPIC `PictureSurface` pattern.
 *
 * The texture is tagged `SRGBColorSpace` so the DAC bytes land verbatim; rows are flipped on write because
 * the index buffer is top-row-first while three's uv origin is bottom-left. authentic = chunky
 * `NearestFilter` upscale; modern = smooth `LinearFilter`.
 */
export class PictureRevealSurface {
  private readonly width: number;
  private readonly height: number;
  private readonly indices: Uint8Array;
  private readonly palette6 = new Uint8Array(256 * 3);
  private readonly rgba: Uint8Array;
  private readonly tex: DataTexture;
  private readonly blit = new Blit();

  constructor(width: number, height: number, indices: Uint8Array) {
    this.width = width;
    this.height = height;
    this.indices = indices;
    this.rgba = new Uint8Array(width * height * 4);
    this.tex = new DataTexture(this.rgba, width, height, RGBAFormat, UnsignedByteType);
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

  /** Push a 6-bit (0..63) palette frame; expands ×4 into the sRGB RGBA buffer and re-uploads. */
  setPalette6(palette6: Uint8Array): void {
    this.palette6.set(palette6.subarray(0, this.palette6.length));
    this.repaint();
  }

  private repaint(): void {
    const { width, height, palette6, rgba } = this;
    const indices = this.indices;
    for (let row = 0; row < height; row++) {
      const src = row * width;
      const dst = (height - 1 - row) * width; // flip vertically
      for (let col = 0; col < width; col++) {
        const c = indices[src + col] ?? 0;
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
    const d = ((this.height - 1 - row) * this.width + col) * 4; // mirror the vertical flip
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

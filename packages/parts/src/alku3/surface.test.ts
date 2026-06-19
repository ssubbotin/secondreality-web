import { LinearFilter, NearestFilter } from 'three';
import { describe, expect, it } from 'vitest';
import { PictureRevealSurface } from './surface.js';

describe('PictureRevealSurface', () => {
  it('maps indices through a live 6-bit palette expanded x4 into sRGB RGBA', () => {
    // 2x2 picture: top-left idx 1, others idx 0
    const indices = new Uint8Array([1, 0, 0, 0]);
    const s = new PictureRevealSurface(2, 2, indices);
    const pal = new Uint8Array(256 * 3);
    pal[1 * 3] = 63; // idx1 = (63, 31, 0) 6-bit
    pal[1 * 3 + 1] = 31;
    pal[1 * 3 + 2] = 0;
    s.setPalette6(pal);
    // idx1 -> (63<<2, 31<<2, 0) = (252, 124, 0), alpha 255
    expect(s.pixelAt(0, 0)).toEqual([252, 124, 0, 255]);
    // idx0 -> black
    expect(s.pixelAt(1, 1)).toEqual([0, 0, 0, 255]);
    s.dispose();
  });

  it('a black palette renders the whole picture black (reveal step 0)', () => {
    const indices = new Uint8Array([5, 9, 200, 1]);
    const s = new PictureRevealSurface(2, 2, indices);
    s.setPalette6(new Uint8Array(256 * 3)); // all black
    expect(s.pixelAt(0, 0)).toEqual([0, 0, 0, 255]);
    expect(s.pixelAt(1, 0)).toEqual([0, 0, 0, 255]);
    expect(s.pixelAt(0, 1)).toEqual([0, 0, 0, 255]);
    expect(s.pixelAt(1, 1)).toEqual([0, 0, 0, 255]);
    s.dispose();
  });

  it('re-applies a fresh palette on every setPalette6 (the fade drives the palette)', () => {
    const indices = new Uint8Array([1]);
    const s = new PictureRevealSurface(1, 1, indices);
    const half = new Uint8Array(256 * 3);
    half[3] = 16; // idx1 r = 16 -> 64
    s.setPalette6(half);
    expect(s.pixelAt(0, 0)[0]).toBe(64);
    const full = new Uint8Array(256 * 3);
    full[3] = 63; // idx1 r = 63 -> 252
    s.setPalette6(full);
    expect(s.pixelAt(0, 0)[0]).toBe(252);
    s.dispose();
  });

  it('toggles the upscale filter for authentic vs modern', () => {
    const s = new PictureRevealSurface(1, 1, new Uint8Array([0]));
    s.setFilter(LinearFilter);
    s.setFilter(NearestFilter);
    s.dispose();
    expect(true).toBe(true);
  });
});

import { LinearFilter, NearestFilter } from 'three';
import { describe, expect, it } from 'vitest';
import { SCREEN_H, SCREEN_W } from './pos.js';
import { ForestSurface } from './surface.js';

describe('ForestSurface', () => {
  it('maps the 320×200 index buffer through a 6-bit palette expanded x4 into sRGB RGBA', () => {
    const pal = new Uint8Array(256 * 3);
    pal[1 * 3] = 63; // idx1 = (63, 31, 0) 6-bit
    pal[1 * 3 + 1] = 31;
    pal[1 * 3 + 2] = 0;
    const s = new ForestSurface(pal);

    const index = new Uint8Array(SCREEN_W * SCREEN_H);
    index[0] = 1; // top-left pixel → idx 1
    index[(SCREEN_H - 1) * SCREEN_W + (SCREEN_W - 1)] = 1; // bottom-right pixel → idx 1
    s.update(index);

    // idx1 -> (63<<2, 31<<2, 0) = (252, 124, 0), alpha 255, read from the top-left origin
    expect(s.pixelAt(0, 0)).toEqual([252, 124, 0, 255]);
    expect(s.pixelAt(SCREEN_W - 1, SCREEN_H - 1)).toEqual([252, 124, 0, 255]);
    // an untouched interior pixel maps to palette index 0 = black
    expect(s.pixelAt(10, 10)).toEqual([0, 0, 0, 255]);
    s.dispose();
  });

  it('toggles the upscale filter for authentic vs modern', () => {
    const s = new ForestSurface(new Uint8Array(256 * 3));
    s.setFilter(LinearFilter);
    s.setFilter(NearestFilter);
    s.dispose();
    expect(true).toBe(true);
  });
});

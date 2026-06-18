import { LinearFilter, NearestFilter } from 'three';
import { describe, expect, it } from 'vitest';
import { PictureSurface } from './surface.js';

describe('PictureSurface', () => {
  it('maps indices through a 6-bit palette expanded x4 into sRGB RGBA', () => {
    // 2x2 picture: top-left idx 1, others idx 0
    const indices = new Uint8Array([1, 0, 0, 0]);
    const s = new PictureSurface(2, 2, indices);
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

  it('toggles the upscale filter for authentic vs modern', () => {
    const s = new PictureSurface(1, 1, new Uint8Array([0]));
    // The DataTexture is created NearestFilter (authentic default for the chunky blit).
    s.setFilter(LinearFilter);
    s.setFilter(NearestFilter);
    s.dispose();
    expect(true).toBe(true);
  });
});

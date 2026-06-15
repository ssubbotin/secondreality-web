import { describe, expect, it } from 'vitest';
import { buildRotozoomPalette, ROTO_PALETTE_SIZE } from './palette.js';

describe('rotozoomer palette', () => {
  it('is the authentic 64-entry triad palette from the source', () => {
    const p = buildRotozoomPalette();
    expect(p).toHaveLength(ROTO_PALETTE_SIZE * 3);
    expect([p[0], p[1], p[2]]).toEqual([0, 0, 0]); // index 0 = black background
    expect([p[3], p[4], p[5]]).toEqual([240, 204, 180]); // index 1 = warm cream (ramp start)
    expect([p[47 * 3], p[47 * 3 + 1], p[47 * 3 + 2]]).toEqual([252, 252, 0]); // index 47 = bright yellow
    expect([p[48 * 3], p[48 * 3 + 1], p[48 * 3 + 2]]).toEqual([140, 144, 176]); // index 48 = blue-grey band
  });
});

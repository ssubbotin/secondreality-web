import { describe, expect, it } from 'vitest';
import { buildLensPalette } from './palette.js';

describe('buildLensPalette', () => {
  const pal = buildLensPalette();

  it('is a 768-byte 6-bit VGA palette', () => {
    expect(pal).toHaveLength(768);
    for (const c of pal) expect(c).toBeLessThanOrEqual(63);
  });

  it('keeps the base picture colours in band 0 (LENS.EXB[16:784])', () => {
    expect([pal[0], pal[1], pal[2]]).toEqual([0, 0, 0]);
    expect([pal[3], pal[4], pal[5]]).toEqual([60, 51, 45]);
    expect([pal[6], pal[7], pal[8]]).toEqual([58, 48, 42]);
  });

  it('extends bands 1..3 with the LENS.EX0 tints (clamped to 63), as MAIN.C:308-325', () => {
    // band 1 (index 64) = base[0] + (0,5,15)
    expect([pal[64 * 3], pal[64 * 3 + 1], pal[64 * 3 + 2]]).toEqual([0, 5, 15]);
    // band 1 index 65 = base[1]=(60,51,45) + (0,5,15) → (60, 56, 60)
    expect([pal[65 * 3], pal[65 * 3 + 1], pal[65 * 3 + 2]]).toEqual([60, 56, 60]);
    // band 3 (index 192) = base[0] + (0,9,37)
    expect([pal[192 * 3], pal[192 * 3 + 1], pal[192 * 3 + 2]]).toEqual([0, 9, 37]);
  });
});

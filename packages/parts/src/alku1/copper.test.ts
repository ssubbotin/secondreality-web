import { describe, expect, it } from 'vitest';
import { copperBandColors, copperRowIndex, SCREEN_H } from './copper.js';
import { COPPER_BASE, COPPER_LEN } from './palette.js';

describe('copper backdrop', () => {
  it('maps every scanline to a copper-band palette index', () => {
    for (let y = 0; y < SCREEN_H; y++) {
      const idx = copperRowIndex(y, 0);
      expect(idx).toBeGreaterThanOrEqual(COPPER_BASE);
      expect(idx).toBeLessThan(COPPER_BASE + COPPER_LEN);
    }
  });

  it('scrolls the bands vertically with the frame (animation)', () => {
    const f0 = Array.from({ length: SCREEN_H }, (_, y) => copperRowIndex(y, 0));
    const f1 = Array.from({ length: SCREEN_H }, (_, y) => copperRowIndex(y, 1));
    expect(f1).not.toEqual(f0); // the bands move
  });

  it('is periodic in the frame counter', () => {
    const a = Array.from({ length: SCREEN_H }, (_, y) => copperRowIndex(y, 3));
    const b = Array.from({ length: SCREEN_H }, (_, y) => copperRowIndex(y, 3 + COPPER_LEN));
    expect(b).toEqual(a);
  });

  it('produces a 6-bit colour for each copper band entry', () => {
    const colors = copperBandColors(0);
    expect(colors.length).toBe(COPPER_LEN * 3);
    for (const v of colors) expect(v).toBeLessThanOrEqual(63);
  });

  it('animates the band hues over frames', () => {
    expect([...copperBandColors(0)]).not.toEqual([...copperBandColors(20)]);
  });
});

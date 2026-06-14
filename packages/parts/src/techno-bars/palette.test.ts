import { describe, expect, it } from 'vitest';
import { buildTechnoPalette, paletteRGB } from './palette.js';

describe('buildTechnoPalette — ported from KOE.C palette build', () => {
  it('is a 16×16×3 byte table', () => {
    expect(buildTechnoPalette().length).toBe(16 * 16 * 3);
  });

  it('a=0 is black at every brightness', () => {
    const pal = buildTechnoPalette();
    expect(paletteRGB(pal, 0, 0)).toEqual([0, 0, 0]);
    expect(paletteRGB(pal, 15, 0)).toEqual([0, 0, 0]);
  });

  it('popcount-1 base colour at c=0 matches the source switch case', () => {
    const pal = buildTechnoPalette();
    // a=1 -> popcount 1 -> (38*64/111, 33*64/111, 44*64/111) = (21,19,25), c=0 leaves it unscaled.
    expect(paletteRGB(pal, 0, 1)).toEqual([21, 19, 25]);
  });

  it('brightness c raises the channels and clamps at 63', () => {
    const pal = buildTechnoPalette();
    const [r] = paletteRGB(pal, 15, 15); // brightest overlap, brightest flash
    expect(r).toBeLessThanOrEqual(63);
    expect(r).toBeGreaterThan(paletteRGB(pal, 0, 15)[0]);
  });
});

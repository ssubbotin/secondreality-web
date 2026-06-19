import { describe, expect, it } from 'vitest';
import { buildCreditsPalette } from './palette.js';

describe('buildCreditsPalette (setrgbpalette ramp)', () => {
  const p = buildCreditsPalette();

  it('keeps index 0 black (the background)', () => {
    expect([p[0], p[1], p[2]]).toEqual([0, 0, 0]);
  });

  it('matches the greyscale ramp from MAIN.C', () => {
    expect([p[3], p[4], p[5]]).toEqual([20, 20, 20]); // index 1
    expect([p[6], p[7], p[8]]).toEqual([40, 40, 40]); // index 2
    expect([p[9], p[10], p[11]]).toEqual([60, 60, 60]); // index 3
  });

  it('fills indices 4..15 with (60,60,60) and leaves the rest black', () => {
    for (let i = 4; i <= 15; i++) {
      expect([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]).toEqual([60, 60, 60]);
    }
    expect([p[16 * 3], p[16 * 3 + 1], p[16 * 3 + 2]]).toEqual([0, 0, 0]);
  });

  it('stays within the 6-bit VGA DAC range', () => {
    for (const v of p) expect(v).toBeLessThanOrEqual(63);
  });
});

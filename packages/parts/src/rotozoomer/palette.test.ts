import { describe, expect, it } from 'vitest';
import { buildRotozoomPalette, hsvToRgb, ROTO_PALETTE_SIZE } from './palette.js';

describe('rotozoomer palette', () => {
  it('hsvToRgb hits the primary/secondary hues', () => {
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]); // red
    expect(hsvToRgb(2, 1, 1)).toEqual([0, 255, 0]); // green
    expect(hsvToRgb(4, 1, 1)).toEqual([0, 0, 255]); // blue
    expect(hsvToRgb(0, 0, 1)).toEqual([255, 255, 255]); // no saturation → white
  });

  it('builds a 64-entry vivid spectrum with a dark background ramp', () => {
    const p = buildRotozoomPalette();
    expect(p).toHaveLength(ROTO_PALETTE_SIZE * 3);
    expect([p[0], p[1], p[2]]).toEqual([0, 0, 0]); // index 0 = black (the image background)
    // from index 5 up, entries are fully bright (max channel 255)
    for (let i = 5; i < ROTO_PALETTE_SIZE; i++) {
      expect(Math.max(p[i * 3] ?? 0, p[i * 3 + 1] ?? 0, p[i * 3 + 2] ?? 0)).toBe(255);
    }
  });
});

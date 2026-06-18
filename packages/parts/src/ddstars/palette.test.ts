import { describe, expect, it } from 'vitest';
import { buildStarPalette } from './palette.js';

describe('ddstars palette', () => {
  const p = buildStarPalette();
  const rgb = (i: number): [number, number, number] => [
    p[i * 3] ?? 0,
    p[i * 3 + 1] ?? 0,
    p[i * 3 + 2] ?? 0,
  ];

  it('is 256 RGB triples', () => {
    expect(p).toHaveLength(256 * 3);
  });

  it('star bands 1/2/3 are the frozen fade-endpoint (bl=255) bluish-white ramp, brightening near→far', () => {
    // index 1 = far/dim band (z>=180), index 2 = mid (110<=z<180), index 3 = near/brightest (z<110).
    expect(rgb(1)).toEqual([16, 20, 25]);
    expect(rgb(2)).toEqual([24, 31, 37]);
    expect(rgb(3)).toEqual([41, 52, 62]);
  });

  it('every channel of every star band is bluish-white (R < G < B) and brighter near the camera', () => {
    for (const i of [1, 2, 3]) {
      const [r, g, b] = rgb(i);
      expect(r).toBeLessThan(g);
      expect(g).toBeLessThan(b);
    }
    expect(rgb(3)[2]).toBeGreaterThan(rgb(1)[2]); // near (3) brighter than far (1)
  });

  it('the background and unused entries are black', () => {
    expect(rgb(0)).toEqual([0, 0, 0]);
    expect(rgb(4)).toEqual([0, 0, 0]);
    expect(rgb(200)).toEqual([0, 0, 0]);
  });
});

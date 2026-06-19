import { describe, expect, it } from 'vitest';
import { fillTriangle, SCREEN_H, SCREEN_W } from './raster.js';

describe('fillTriangle', () => {
  it('fills the interior pixels of a simple triangle', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    fillTriangle(buf, 7, { x: 10, y: 10 }, { x: 30, y: 10 }, { x: 20, y: 30 });
    // The top edge centre and the centroid should be filled with colour 7.
    expect(buf[10 * SCREEN_W + 20]).toBe(7);
    expect(buf[18 * SCREEN_W + 20]).toBe(7);
    // A point well outside is untouched.
    expect(buf[40 * SCREEN_W + 200]).toBe(0);
  });

  it('clips to the screen bounds without overflow', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    // Triangle partly off the left/top — must not throw or write out of range.
    fillTriangle(buf, 5, { x: -50, y: -50 }, { x: 40, y: 5 }, { x: -20, y: 60 });
    let lit = 0;
    for (const v of buf) if (v === 5) lit++;
    expect(lit).toBeGreaterThan(0);
  });

  it('ignores a zero-height (degenerate) triangle', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    fillTriangle(buf, 9, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 50, y: 50 });
    expect(buf.every((v) => v === 0)).toBe(true);
  });
});

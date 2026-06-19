import { describe, expect, it } from 'vitest';
import { rasterFrame, SCREEN_H, SCREEN_W } from './raster.js';
import type { ScreenPoly } from './scene.js';

const at = (buf: Uint8Array, x: number, y: number): number => buf[y * SCREEN_W + x] ?? 0;

describe('vector1 flat-polygon raster (VISU/ADRAW.ASM normal fill)', () => {
  it('fills a triangle flat with its colour and clears the rest to bg', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const tri: ScreenPoly = {
      color: 42,
      pts: [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 20, y: 30 },
      ],
    };
    rasterFrame(out, [tri]);
    // Interior pixel is the flat colour.
    expect(at(out, 20, 15)).toBe(42);
    // Outside the triangle stays bg.
    expect(at(out, 5, 5)).toBe(0);
    expect(at(out, 100, 100)).toBe(0);
  });

  it('clips polygons to the viewport without writing out of bounds', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const big: ScreenPoly = {
      color: 7,
      pts: [
        { x: -100, y: -100 },
        { x: 1000, y: -100 },
        { x: 1000, y: 1000 },
        { x: -100, y: 1000 },
      ],
    };
    // Must not throw / write past the buffer.
    rasterFrame(out, [big]);
    // The whole screen is covered.
    expect(at(out, 0, 0)).toBe(7);
    expect(at(out, SCREEN_W - 1, SCREEN_H - 1)).toBe(7);
    expect(at(out, 160, 100)).toBe(7);
  });

  it('painter order: a later poly overwrites an earlier one', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const a: ScreenPoly = {
      color: 1,
      pts: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ],
    };
    const b: ScreenPoly = {
      color: 2,
      pts: [
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 40 },
        { x: 10, y: 40 },
      ],
    };
    rasterFrame(out, [a, b]);
    expect(at(out, 5, 5)).toBe(1); // only a
    expect(at(out, 25, 25)).toBe(2); // b drawn over a
  });

  it('a degenerate (<3 pts) poly draws nothing', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    rasterFrame(out, [{ color: 9, pts: [{ x: 0, y: 0 }] }]);
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

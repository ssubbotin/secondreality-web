import { describe, expect, it } from 'vitest';
import { rasterStars, SCREEN_H, SCREEN_W, StarRaster } from './raster.js';
import { createStarState, FIELD_H, stepStars } from './star-sim.js';
import { buildMuldivX, buildMuldivY } from './tables.js';

const mdx = buildMuldivX();
const mdy = buildMuldivY();

const stepN = (n: number) => {
  const s = createStarState();
  for (let i = 0; i < n; i++) stepStars(s, mdx, mdy);
  return s;
};

describe('rasterStars (single frame, top half only)', () => {
  it('plots active stars into the top 100 rows with indices ∈ {0,1,2,3}', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const s = stepN(300);
    rasterStars(out, s);
    let lit = 0;
    for (let i = 0; i < out.length; i++) {
      const v = out[i] ?? 0;
      if (v !== 0) {
        lit++;
        expect([1, 2, 3]).toContain(v);
        expect(Math.floor(i / SCREEN_W)).toBeLessThan(FIELD_H); // top half only
      }
    }
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThanOrEqual(s.count);
  });

  it('clears the buffer first (poison is wiped)', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    out.fill(7);
    rasterStars(out, createStarState());
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

describe('StarRaster (top + delayed mirror)', () => {
  it('mirrors a delayed frame into the bottom half (row r ↔ 199 − r), empty until the ring fills', () => {
    const r = new StarRaster();
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const s = createStarState();
    s.starlimit = 0;

    // Plant one on-screen star at a fixed position and render the first frame.
    const plant = (): void => {
      s.count = 1;
      s.sx[0] = 100;
      s.sy[0] = 40;
      s.band[0] = 3;
    };
    plant();
    r.render(out, s);
    // Frame 0: top half lit at (100,40); bottom half still empty (ring not yet delayed).
    expect(out[40 * SCREEN_W + 100]).toBe(3);
    const bottomLit0 = out.slice(FIELD_H * SCREEN_W).some((v) => v !== 0);
    expect(bottomLit0).toBe(false);

    // Advance the ring MIRROR_DELAY frames; the planted star should appear mirrored at row 199−40 = 159.
    for (let i = 0; i < 32; i++) {
      plant();
      r.render(out, s);
    }
    expect(out[(199 - 40) * SCREEN_W + 100]).toBe(3); // mirrored reflection
    expect(out[40 * SCREEN_W + 100]).toBe(3); // current frame still in the top half
  });

  it('never writes outside the 320×200 buffer over a long run', () => {
    const r = new StarRaster();
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    const s = createStarState();
    expect(() => {
      for (let t = 0; t < 500; t++) {
        stepStars(s, mdx, mdy);
        r.render(out, s);
      }
    }).not.toThrow();
    expect(out).toHaveLength(SCREEN_W * SCREEN_H);
  });
});

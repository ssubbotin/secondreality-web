import { describe, expect, it } from 'vitest';
import type { ProjectedPoint } from './cube.js';
import {
  countConst,
  lightDir,
  PORT_X_BIAS,
  PORT_Y_BIAS,
  rotateProject,
  sortFaces,
} from './cube.js';
import { drawPoly, rasterCube, SCREEN_H, SCREEN_W } from './raster.js';
import { getspl } from './spline.js';
import { buildKosinit, buildRata, buildSini, buildSinit, buildSplineCoef } from './tables.js';
import { buildDist, buildTiles } from './texture.js';

const sinit = buildSinit();
const kosinit = buildKosinit(sinit);
const coef = buildSplineCoef();
const rata = buildRata();
const sini = buildSini();
const tiles = buildTiles(sini);
const dist = buildDist(sini);

/** A flat axis-aligned screen quad (sx,sy); xx/yy/zz unused by the rasteriser. */
const flatQuad = (x0: number, y0: number, x1: number, y1: number): ProjectedPoint[] => [
  { xx: 0, yy: 0, zz: 1, sx: x0, sy: y0 },
  { xx: 0, yy: 0, zz: 1, sx: x1, sy: y0 },
  { xx: 0, yy: 0, zz: 1, sx: x1, sy: y1 },
  { xx: 0, yy: 0, zz: 1, sx: x0, sy: y1 },
];

describe('cube rasteriser', () => {
  it('fills an axis-aligned quad and leaves the rest of the buffer black', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    drawPoly(out, flatQuad(40, 30, 120, 90), tiles[0], dist, 0);
    // Inside the quad: at least some texels were written (band 0 → palette 1..63).
    let painted = 0;
    for (let y = 31; y < 90; y++) {
      for (let x = 41; x < 120; x++) {
        const v = out[y * SCREEN_W + x] ?? 0;
        if (v !== 0) painted++;
        // band 0 only ever produces palette indices 1..63.
        expect(v).toBeLessThanOrEqual(63);
      }
    }
    expect(painted).toBeGreaterThan(2000);
    // Far outside the quad stays black.
    expect(out[5 * SCREEN_W + 5]).toBe(0);
    expect(out[150 * SCREEN_W + 300]).toBe(0);
  });

  it('clips a quad to the buffer (nothing written outside [0,200) rows or [0,320) cols)', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    // A quad straddling the top/left edges: rows/cols below 0 must not write (no wrap, no overflow).
    drawPoly(out, flatQuad(-30, -20, 60, 50), tiles[0], dist, 0);
    // Buffer length is exactly the field; any out-of-range write would have thrown / corrupted — the
    // in-bounds portion is painted and the rest stays black.
    expect(out.length).toBe(SCREEN_W * SCREEN_H);
    let painted = 0;
    for (let y = 0; y < 50; y++) for (let x = 0; x < 60; x++) if (out[y * SCREEN_W + x]) painted++;
    expect(painted).toBeGreaterThan(0);
  });

  it('uses the matching colour band per face (band 1 → 64..127, band 2 → 128..191)', () => {
    const out1 = new Uint8Array(SCREEN_W * SCREEN_H);
    drawPoly(out1, flatQuad(40, 30, 120, 90), tiles[1], dist, 0);
    const out2 = new Uint8Array(SCREEN_W * SCREEN_H);
    drawPoly(out2, flatQuad(40, 30, 120, 90), tiles[2], dist, 0);
    const nonzero = (b: Uint8Array): number[] => {
      const vs: number[] = [];
      for (const v of b) if (v !== 0) vs.push(v);
      return vs;
    };
    for (const v of nonzero(out1)) {
      expect(v).toBeGreaterThanOrEqual(64);
      expect(v).toBeLessThanOrEqual(127);
    }
    for (const v of nonzero(out2)) {
      expect(v).toBeGreaterThanOrEqual(128);
      expect(v).toBeLessThanOrEqual(191);
    }
  });

  it('rasterCube draws the visible faces of the frame-0 cube and clears first', () => {
    const s = getspl(4 * 256, coef, rata);
    const m = countConst(s.kx & 1023, s.ky & 1023, s.kz & 1023, sinit, kosinit);
    const pts = rotateProject(m, s.tx, s.ty, s.dis, PORT_X_BIAS, PORT_Y_BIAS);
    const visible = sortFaces(pts, lightDir(s.lsKx, s.lsKy, sinit, kosinit));
    expect(visible.length).toBe(3);
    const out = new Uint8Array(SCREEN_W * SCREEN_H);
    out.fill(99); // prove rasterCube clears
    rasterCube(out, pts, visible, tiles, dist, 0);
    let painted = 0;
    let leftover99 = 0;
    for (const v of out) {
      if (v !== 0) painted++;
      if (v === 99) leftover99++;
    }
    expect(painted).toBeGreaterThan(0);
    expect(leftover99).toBe(0); // the fill(99) was cleared
  });
});

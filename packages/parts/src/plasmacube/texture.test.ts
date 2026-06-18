import { describe, expect, it } from 'vitest';
import { buildSini } from './tables.js';
import {
  buildDist,
  buildTile,
  buildTiles,
  DIST_H,
  DIST_W,
  TILE_H,
  TILE_W,
} from './texture.js';

const sini = buildSini();

describe('cube tile + distortion textures', () => {
  it('buildTile reproduces the verbatim kuva sine-tile values per band', () => {
    const t0 = buildTile(sini, 0);
    const t1 = buildTile(sini, 1);
    const t2 = buildTile(sini, 2);
    expect(t0).toHaveLength(TILE_W * TILE_H);
    expect(t0[0 * TILE_W + 0]).toBe(32);
    expect(t0[10 * TILE_W + 20]).toBe(61);
    expect(t0[63 * TILE_W + 255]).toBe(34);
    // Each band is the same shape offset by 64 (into its palette band).
    expect(t1[10 * TILE_W + 20]).toBe(125);
    expect(t2[10 * TILE_W + 20]).toBe(189);
  });

  it('band 0 tile values land in palette band 0 (1..63)', () => {
    const t0 = buildTile(sini, 0);
    let lo = 255;
    let hi = 0;
    for (const v of t0) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBe(1);
    expect(hi).toBe(63);
  });

  it('buildTiles returns the three bands', () => {
    const [a, b, c] = buildTiles(sini);
    expect(a[10 * TILE_W + 20]).toBe(61);
    expect(b[10 * TILE_W + 20]).toBe(125);
    expect(c[10 * TILE_W + 20]).toBe(189);
  });

  it('buildDist is a per-row constant = sini[y·8]/3 (C truncating divide)', () => {
    const d = buildDist(sini);
    expect(d).toHaveLength(DIST_W * DIST_H);
    expect(d[0 * DIST_W + 0]).toBe(0);
    expect(d[10 * DIST_W + 0]).toBe(35);
    expect(d[10 * DIST_W + 100]).toBe(35); // constant across the row
    let lo = 127;
    let hi = -128;
    for (const v of d) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBe(-42);
    expect(hi).toBe(42);
  });
});

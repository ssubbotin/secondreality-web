import { cdiv } from './cint.js';

/** The cube tile is a 256-wide × 64-tall index image (PLZFILL.C kuva1/2/3). */
export const TILE_W = 256;
export const TILE_H = 64;

/** The vertical distortion map is 256 × 128 (PLZFILL.C dist1). */
export const DIST_W = 256;
export const DIST_H = 128;

/**
 * buildTile (INITVECT, PLZFILL.C:57-62): kuva<band>[y][x] = sini[(y·4 + sini[x·2]) & 511]/4 + 32 +
 * band·64, for y∈[0,64), x∈[0,256). Each of the three bands shares the same shape, offset to its
 * palette band (0/64/128). The result is a row-major Uint8Array index image per band.
 *   band 0 → palette entries 32..63, band 1 → 96..127, band 2 → 160..191.
 */
export function buildTile(sini: Int16Array, band: number): Uint8Array {
  const out = new Uint8Array(TILE_W * TILE_H);
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      // The whole (y·4 + sini[x·2]) sum is masked with & 511 in C; sini[x·2] may be negative, and a
      // C `& 511` on a signed int yields the non-negative low 9 bits — JS `& 511` matches exactly.
      const idx = (y * 4 + (sini[x * 2] ?? 0)) & 511;
      // sini[idx]/4 is C integer division (truncate toward zero), not an arithmetic shift.
      out[y * TILE_W + x] = cdiv(sini[idx] ?? 0, 4) + 32 + band * 64;
    }
  }
  return out;
}

/** All three tile bands (kuva1/kuva2/kuva3). */
export function buildTiles(sini: Int16Array): [Uint8Array, Uint8Array, Uint8Array] {
  return [buildTile(sini, 0), buildTile(sini, 1), buildTile(sini, 2)];
}

/**
 * buildDist (INITVECT, PLZFILL.C:64-65): dist1[y][x] = sini[y·8]/3 for y∈[0,128), x∈[0,256). Each
 * row is constant in x; the row value is the per-row vertical wobble of the texture sample (the
 * cube faces' liquid shimmer in do_block). Stored row-major.
 */
export function buildDist(sini: Int16Array): Int8Array {
  const out = new Int8Array(DIST_W * DIST_H);
  for (let y = 0; y < DIST_H; y++) {
    const v = Math.trunc((sini[y * 8] ?? 0) / 3);
    for (let x = 0; x < DIST_W; x++) out[y * DIST_W + x] = v;
  }
  return out;
}

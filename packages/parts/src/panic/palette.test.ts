import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fadeVgaPalette, paletteLut, parseVgaPalette } from './palette.js';

// vitest runs in node and *.test.ts is excluded from tsc, so node:fs/node:url are fine here.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('panic palette (MONSTER.PAL)', () => {
  const raw = fixture('MONSTER.PAL');
  const pal = parseVgaPalette(new Uint8Array(raw));

  it('parses 256 6-bit RGB triples byte-for-byte from MONSTER.PAL', () => {
    expect(pal).toHaveLength(256 * 3);
    expect(Buffer.from(pal).equals(raw.subarray(0, 768))).toBe(true);
  });

  it('every component is a 6-bit value (0..63)', () => {
    expect(pal.every((v) => v <= 63)).toBe(true);
  });

  it('matches the known MONSTER.PAL header (index 0 = black; index 1 = white 63,63,63)', () => {
    expect([pal[0], pal[1], pal[2]]).toEqual([0, 0, 0]);
    expect([pal[3], pal[4], pal[5]]).toEqual([63, 63, 63]);
  });

  it('paletteLut expands 6-bit VGA to sRGB bytes (×4) with opaque alpha', () => {
    const lut = paletteLut(pal);
    expect(lut).toHaveLength(256 * 4);
    for (let i = 0; i < 256; i++) {
      expect(lut[i * 4]).toBe((pal[i * 3] ?? 0) * 4);
      expect(lut[i * 4 + 1]).toBe((pal[i * 3 + 1] ?? 0) * 4);
      expect(lut[i * 4 + 2]).toBe((pal[i * 3 + 2] ?? 0) * 4);
      expect(lut[i * 4 + 3]).toBe(255);
    }
    // index 1 (white) → 252,252,252 (63×4)
    expect([lut[4], lut[5], lut[6]]).toEqual([252, 252, 252]);
  });

  it('fadeVgaPalette(a=0) is the picture palette (with index 0 pinned black)', () => {
    const f = fadeVgaPalette(pal, 0);
    // index 0 forced black; index 1 (white 63) stays 63
    expect([f[0], f[1], f[2]]).toEqual([0, 0, 0]);
    expect([f[3], f[4], f[5]]).toEqual([63, 63, 63]);
  });

  it('fadeVgaPalette blends toward white with C integer division: (a*63 + v*(64-a))/64', () => {
    const f = fadeVgaPalette(pal, 32);
    // a generic non-background colour: take index 100 (in the monster body)
    const v = (c: number) => Math.trunc((32 * 63 + (pal[100 * 3 + c] ?? 0) * (64 - 32)) / 64);
    expect([f[300], f[301], f[302]]).toEqual([v(0), v(1), v(2)]);
  });

  it('fadeVgaPalette(a=63) is essentially white for every non-background slot', () => {
    const f = fadeVgaPalette(pal, 63);
    // (63*63 + v*1)/64 ≥ 62 for any v ≥ 0; index 1 → (63*63+63)/64 = 63
    expect(f[3]).toBe(63);
    expect(f[300]).toBeGreaterThanOrEqual(62);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMBG_H, COMBG_W, decodeCombg } from './combg.js';
import { buildComanchePalette } from './palette.js';
import { FIELD_W } from './raster.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const lbm = (): ArrayBuffer => {
  const b = fixture('COMBG.LBM');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// Independent golden values, derived from COMBG.LBM by a from-scratch Python decode of the IFF PBM body
// (ByteRun1) + CMAP (`>>2` for 6-bit, the same truncation as lbm2u's `getc/4`) — NOT from decodeCombg.

// Palette band for colour indices 240..255 (16 colours × 6-bit RGB): the dark-blue→light-blue horizon ramp.
const GOLDEN_BAND_6BIT = [
  1, 2, 12, 1, 2, 13, 2, 3, 14, 2, 4, 16, 3, 5, 17, 3, 6, 19, 4, 7, 20, 5, 8, 21, 6, 9, 23, 7, 10,
  24, 7, 12, 26, 8, 13, 27, 9, 14, 28, 10, 16, 30, 12, 17, 31, 13, 19, 33,
];

describe('decodeCombg (COMBG.LBM sky backdrop — MAIN.C + lbm2u)', () => {
  it('reports the COMBG.LBM picture geometry (320×90 PBM)', () => {
    expect(COMBG_W).toBe(320);
    expect(COMBG_H).toBe(90);
  });

  it('palette band 240..255 is the COMBG 6-bit horizon ramp (MAIN.C combg[16+x]→palette[720..767])', () => {
    const { paletteBand } = decodeCombg(lbm());
    expect(paletteBand).toHaveLength(16 * 3);
    expect([...paletteBand]).toEqual(GOLDEN_BAND_6BIT);
  });

  it('the band is a dark→light blue gradient (blue dominant, monotonically rising)', () => {
    const { paletteBand } = decodeCombg(lbm());
    // Blue channel of each of the 16 entries rises across the ramp; blue > red throughout (a blue sky).
    let prevBlue = -1;
    for (let i = 0; i < 16; i++) {
      const r = paletteBand[i * 3] ?? 0;
      const b = paletteBand[i * 3 + 2] ?? 0;
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThanOrEqual(prevBlue);
      prevBlue = b;
    }
  });

  it('the backdrop body is FIELD_W×COMBG_H in screen-row order: black sky top, gradient toward horizon', () => {
    const { body, rows } = decodeCombg(lbm());
    expect(rows).toBe(COMBG_H);
    expect(body).toHaveLength(FIELD_W * COMBG_H);
    // Rows 0..58 are sky-black (index 0); rows 59..89 are the contiguous ramp 225..255 (one index/row).
    for (let y = 0; y <= 58; y++) {
      for (let a = 0; a < FIELD_W; a++) expect(body[y * FIELD_W + a]).toBe(0);
    }
    for (let y = 59; y < COMBG_H; y++) {
      const expected = 225 + (y - 59);
      for (let a = 0; a < FIELD_W; a++) expect(body[y * FIELD_W + a]).toBe(expected);
    }
  });

  it('field column a samples COMBG even chunky columns (the mode-X pixel-doubling combuse blit)', () => {
    // Every COMBG row is colour-uniform, so column choice is invisible in value — but assert the body is
    // FIELD_W (160) wide, i.e. it kept exactly the 160 effective columns the original docopy produced.
    const { body } = decodeCombg(lbm());
    const horizonRow = 89;
    for (let a = 0; a < FIELD_W; a++) expect(body[horizonRow * FIELD_W + a]).toBe(255);
  });

  it('the decoded band, fed to buildComanchePalette, lands verbatim in colour indices 240..255', () => {
    const { paletteBand } = decodeCombg(lbm());
    const pal = buildComanchePalette(paletteBand);
    // palette[(256-16)*3 .. 768) == paletteBand (MAIN.C: palette[x]=combg[16+x]).
    for (let i = 0; i < 16 * 3; i++) {
      expect(pal[(256 - 16) * 3 + i]).toBe(paletteBand[i]);
    }
  });

  it('without a band, buildComanchePalette leaves indices 240..255 black (the math-only fallback)', () => {
    const pal = buildComanchePalette();
    for (let i = (256 - 16) * 3; i < 768; i++) expect(pal[i]).toBe(0);
  });
});

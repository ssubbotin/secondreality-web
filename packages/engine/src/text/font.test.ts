import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeU } from '../assets/decode-u.js';
import { buildFont, FONA_ORDER, loadFona } from './font.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

// The FONA glyph sheet decodes with `glyphSheet: true` (the raw `FONA.INC` font body at `add*16 - 1`).
const fona = (): ReturnType<typeof loadFona> =>
  loadFona(decodeU(fixture('FONA.UH'), { glyphSheet: true }));

describe('buildFont (FONA glyph segmentation)', () => {
  it('segments exactly one glyph per character in FONA_ORDER plus a forced space', () => {
    const font = fona();
    // 75 ordered glyphs + the explicit space cell.
    expect(font.glyphs.size).toBe(FONA_ORDER.length + 1);
    for (const ch of FONA_ORDER) expect(font.glyphs.has(ch)).toBe(true);
    expect(font.glyphs.has(' ')).toBe(true);
  });

  it('reproduces the MAIN.C init() column-segmentation against the real FONA sheet', () => {
    const font = fona();
    // Derived by running the original's exact segmentation over the decoded FONA.UH. (The hand-written
    // `A: 0 20` comment in MAIN.C is stale by one: the shipped sheet has a leading all-empty column, so A
    // lands at column 1.) These widths match the original's `+2` advance metrics.
    const oracle: Array<[string, number, number]> = [
      ['A', 1, 20],
      ['B', 22, 15],
      ['C', 38, 14],
      ['D', 53, 17],
      ['E', 71, 14],
      ['I', 137, 9],
      ['W', 365, 25],
      ['a', 408, 13],
      ['0', 773, 14],
      ['9', 893, 13],
      ['!', 907, 3],
    ];
    for (const [ch, x, width] of oracle) {
      const g = font.glyphs.get(ch);
      expect(g, ch).toBeDefined();
      expect([ch, g?.x, g?.width]).toEqual([ch, x, width]);
    }
  });

  it('forces the space cell to MAIN.C fonap[32]=1480, fonaw[32]=16', () => {
    const font = fona();
    const sp = font.glyphs.get(' ');
    expect(sp?.x).toBe(1500 - 20);
    expect(sp?.width).toBe(16);
  });

  it('exposes the 30-row, 1500-wide ink sheet', () => {
    const font = fona();
    expect(font.height).toBe(30);
    expect(font.sheetWidth).toBe(1500);
    expect(font.sheet.length).toBe(1500 * 30);
    // ink values are 0..3 (the 2-bit font), not the plane-intensity remap.
    for (const v of font.sheet) expect(v).toBeLessThanOrEqual(3);
  });

  it('measure() sums glyph widths plus the 2px advance gap, as prt()', () => {
    const font = fona();
    // prt advances x += fonaw[ch] + 2 per glyph (MAIN.C:288).
    const widths = [...'ABC'].map((ch) => (font.glyphs.get(ch)?.width ?? 0) + 2);
    expect(font.measure('ABC')).toBe(widths.reduce((a, b) => a + b, 0));
  });

  it('treats a missing glyph as having zero width', () => {
    const font = fona();
    // '~' is not in FONA_ORDER.
    expect(font.glyphs.has('~')).toBe(false);
    expect(font.measure('~')).toBe(0);
  });

  it('buildFont segments a synthetic sheet deterministically', () => {
    // 5-wide × 2-tall sheet: col0 empty, cols1-2 glyph 'X', col3 empty, col4 glyph 'Y'.
    const w = 5;
    const sheet = Uint8Array.from([
      0,
      1,
      2,
      0,
      3, //
      0,
      1,
      0,
      0,
      0,
    ]);
    const font = buildFont(sheet, w, 2, 'XY');
    expect(font.glyphs.get('X')).toEqual({ ch: 'X', x: 1, width: 2 });
    expect(font.glyphs.get('Y')).toEqual({ ch: 'Y', x: 4, width: 1 });
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeU } from './decode-u.js';
import { FONA_ORDER, FONAY, loadFona } from './font.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const font = loadFona(decodeU(fixture('FONA.UH')));

describe('loadFona (ENDSCRL glyph segmentation)', () => {
  it('segments one glyph per order character (73 cells) plus the forced space', () => {
    // FONA_ORDER is the 74-byte order string from MAIN.C:13.
    expect(FONA_ORDER.length).toBe(74);
    // The 74-char order maps to 73 unique glyph keys (the accented `é` appears twice, so the duplicate
    // key collapses), and loadFona adds the forced space cell.
    expect(font.glyphs.size).toBe(74); // 73 unique keys + space
    expect(font.height).toBe(FONAY);
    expect(font.height).toBe(30);
  });

  it('places the known glyph cells at the measured positions', () => {
    expect(font.glyphs.get('A')).toEqual({ ch: 'A', x: 0, width: 21 });
    expect(font.glyphs.get('B')).toEqual({ ch: 'B', x: 22, width: 15 });
    expect(font.glyphs.get('a')).toEqual({ ch: 'a', x: 408, width: 13 });
    expect(font.glyphs.get('0')).toEqual({ ch: '0', x: 773, width: 14 });
    expect(font.glyphs.get('!')).toEqual({ ch: '!', x: 907, width: 3 });
  });

  it('forces the space cell to x=1500-20, width=16 (MAIN.C:123-124)', () => {
    expect(font.glyphs.get(' ')).toEqual({ ch: ' ', x: 1480, width: 16 });
  });

  it('measure() sums glyphWidth+gap, matching the do_scroll advance', () => {
    // 'A' is width 21 + gap 2 = 23.
    expect(font.measure('A')).toBe(23);
    // 'Here goes:' hand-summed against the segmented widths.
    expect(font.measure('Here goes:')).toBe(137);
  });

  it('skips characters with no glyph entry (Y, Z, ", ; are unmapped — zero width)', () => {
    expect(font.glyphs.has('Y')).toBe(false);
    expect(font.glyphs.has('Z')).toBe(false);
    expect(font.glyphs.has('"')).toBe(false);
    expect(font.glyphs.has(';')).toBe(false);
    // An unmapped char contributes nothing to the measured width (the original quirk).
    expect(font.measure('AYZ')).toBe(font.measure('A'));
  });
});

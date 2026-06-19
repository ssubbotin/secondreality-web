import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildFont, decodeU, FONA_ORDER, loadFona } from './font.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe('decodeU', () => {
  it('reads the FONA.UH header (1500×30 glyph sheet)', () => {
    const d = decodeU(fixture('FONA.UH'));
    expect(d.width).toBe(1500);
    expect(d.height).toBe(30);
    expect(d.cols).toBe(256);
  });

  it('reads the HOI.U header (640×200 picture)', () => {
    const d = decodeU(fixture('HOI.U'));
    expect(d.width).toBe(640);
    expect(d.height).toBe(200);
    expect(d.cols).toBe(256);
    expect(d.indices.length).toBe(640 * 200);
  });

  it('decodes a 256-colour, 6-bit palette', () => {
    const d = decodeU(fixture('HOI.U'));
    expect(d.palette.length).toBe(256 * 3);
    for (const v of d.palette) expect(v).toBeLessThanOrEqual(63);
  });

  it('decodes HOI pixels in the picture index band (0..63)', () => {
    const d = decodeU(fixture('HOI.U'));
    let max = 0;
    for (const v of d.indices) if (v > max) max = v;
    expect(max).toBeLessThan(64);
  });
});

describe('buildFont / loadFona (FONA segmentation, MAIN.C:214-235)', () => {
  const fona = (): ReturnType<typeof loadFona> => loadFona(decodeU(fixture('FONA.UH')));

  it('segments one glyph per FONA_ORDER char plus a forced space', () => {
    const font = fona();
    expect(font.glyphs.size).toBe(FONA_ORDER.length + 1);
    for (const ch of FONA_ORDER) expect(font.glyphs.has(ch)).toBe(true);
    expect(font.glyphs.has(' ')).toBe(true);
  });

  it('reproduces the MAIN.C column segmentation against the real sheet', () => {
    const font = fona();
    const oracle: Array<[string, number, number]> = [
      ['A', 1, 20],
      ['B', 22, 15],
      ['C', 38, 14],
      ['I', 137, 9],
      ['W', 365, 25],
      ['0', 773, 14],
      ['9', 893, 13],
      ['!', 907, 3],
    ];
    for (const [ch, x, width] of oracle) {
      const g = font.glyphs.get(ch);
      expect([ch, g?.x, g?.width]).toEqual([ch, x, width]);
    }
  });

  it('forces the space cell to fonap[32]=1480, fonaw[32]=16', () => {
    const font = fona();
    expect(font.glyphs.get(' ')?.x).toBe(1500 - 20);
    expect(font.glyphs.get(' ')?.width).toBe(16);
  });

  it('exposes the 30-row ink sheet with 0..3 levels', () => {
    const font = fona();
    expect(font.height).toBe(30);
    expect(font.sheetWidth).toBe(1500);
    for (const v of font.sheet) expect(v).toBeLessThanOrEqual(3);
  });

  it('measure() sums glyph widths plus the 2-px gap', () => {
    const font = fona();
    const widths = [...'ABC'].map((ch) => (font.glyphs.get(ch)?.width ?? 0) + 2);
    expect(font.measure('ABC')).toBe(widths.reduce((a, b) => a + b, 0));
  });

  it('buildFont segments a synthetic sheet deterministically', () => {
    const sheet = Uint8Array.from([0, 1, 2, 0, 3, 0, 1, 0, 0, 0]);
    const font = buildFont(sheet, 5, 2, 'XY');
    expect(font.glyphs.get('X')).toEqual({ ch: 'X', x: 1, width: 2 });
    expect(font.glyphs.get('Y')).toEqual({ ch: 'Y', x: 4, width: 1 });
  });
});

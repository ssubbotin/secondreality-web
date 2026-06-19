import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type BitmapFont, decodeU, loadFona } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import { addText, CENTER_X, inkPlaneByte, makeTextBuffer, TBUF_H, TBUF_W } from './text-buffer.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

const loadFont = (): BitmapFont => loadFona(decodeU(fixture('FONA.UH'), { glyphSheet: true }));

describe('inkPlaneByte (MAIN.C:169-182 plane remap)', () => {
  it('maps the 2-bit font level to a VGA plane byte', () => {
    expect(inkPlaneByte(0)).toBe(0x00);
    expect(inkPlaneByte(1)).toBe(0x40);
    expect(inkPlaneByte(2)).toBe(0x80);
    expect(inkPlaneByte(3)).toBe(0xc0);
  });
});

describe('text buffer geometry', () => {
  it('matches the original char tbuf[186][352]', () => {
    const tbuf = makeTextBuffer();
    expect(TBUF_W).toBe(352);
    expect(TBUF_H).toBe(186);
    expect(tbuf.length).toBe(352 * 186);
  });
});

describe('addText (port of MAIN.C addtext)', () => {
  it('stamps glyph ink as plane bytes, never raw levels', () => {
    const font = loadFont();
    const tbuf = makeTextBuffer();
    addText(tbuf, font, CENTER_X, 40, 'A');
    let nonZero = 0;
    for (const v of tbuf) {
      if (v !== 0) {
        nonZero++;
        // every stamped pixel is one of the plane bytes.
        expect([0x40, 0x80, 0xc0]).toContain(v);
      }
    }
    expect(nonZero).toBeGreaterThan(0);
  });

  it('centres the line: the ink spans symmetrically about tx', () => {
    const font = loadFont();
    const tbuf = makeTextBuffer();
    addText(tbuf, font, CENTER_X, 40, 'Music');
    // Collect the stamped column range.
    let minX = TBUF_W;
    let maxX = -1;
    for (let y = 0; y < TBUF_H; y++) {
      for (let x = 0; x < TBUF_W; x++) {
        if ((tbuf[y * TBUF_W + x] ?? 0) !== 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    expect(maxX).toBeGreaterThan(minX);
    const w = Math.trunc(font.measure('Music') / 2);
    // The original starts the first glyph at tx - w; the ink begins at or after that.
    expect(minX).toBeGreaterThanOrEqual(CENTER_X - w - 1);
    // The centre of the stamped span is close to CENTER_X (within a glyph gap).
    const mid = (minX + maxX) / 2;
    expect(Math.abs(mid - CENTER_X)).toBeLessThan(font.gap + 4);
  });

  it('places ink within the 30 font rows below ty', () => {
    const font = loadFont();
    const tbuf = makeTextBuffer();
    const ty = 50;
    addText(tbuf, font, CENTER_X, ty, 'Code');
    for (let y = 0; y < TBUF_H; y++) {
      for (let x = 0; x < TBUF_W; x++) {
        if ((tbuf[y * TBUF_W + x] ?? 0) !== 0) {
          expect(y).toBeGreaterThanOrEqual(ty);
          expect(y).toBeLessThan(ty + font.height);
        }
      }
    }
  });

  it('clips out-of-bounds columns without throwing', () => {
    const font = loadFont();
    const tbuf = makeTextBuffer();
    // A long line centred near the right edge: part falls off, must not write OOB.
    expect(() => addText(tbuf, font, TBUF_W - 4, 40, 'Purple Motion')).not.toThrow();
  });

  it('ignores characters absent from the FONA order', () => {
    const font = loadFont();
    const a = makeTextBuffer();
    const b = makeTextBuffer();
    addText(a, font, CENTER_X, 40, 'Psi');
    addText(b, font, CENTER_X, 40, 'Psi~'); // '~' is not a FONA glyph
    // The unknown glyph contributes nothing past its position; the kept glyphs match.
    expect(a).toEqual(b);
  });
});

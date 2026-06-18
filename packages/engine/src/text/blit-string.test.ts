import { describe, expect, it } from 'vitest';
import { blitString, blitStringCentered } from './blit-string.js';
import { buildFont } from './font.js';

/** A tiny 2-glyph font on a 5×2 sheet: 'X' = cols1-2, 'Y' = col4. */
function tinyFont() {
  const sheet = Uint8Array.from([
    0,
    1,
    2,
    0,
    3, //
    0,
    3,
    1,
    0,
    2,
  ]);
  return buildFont(sheet, 5, 2, 'XY');
}

describe('blitString', () => {
  it('copies a glyph cell into the destination at (x,y), mapping ink → palette index via ink fn', () => {
    const font = tinyFont();
    const w = 8;
    const h = 4;
    const dst = new Uint8Array(w * h);
    // ink(level) = level + 0x40 (mirrors MAIN.C: font level 1/2/3 → 0x40/0x80/0xC0 band).
    blitString(dst, w, h, font, 'X', 2, 1, (level) => 0x40 * level);
    // Glyph X is cols1-2 of the sheet: row0 = [1,2], row1 = [3,1]. Placed at dst (2,1)/(3,1)/(2,2)/(3,2).
    expect(dst[1 * w + 2]).toBe(0x40 * 1);
    expect(dst[1 * w + 3]).toBe(0x40 * 2);
    expect(dst[2 * w + 2]).toBe(0x40 * 3);
    expect(dst[2 * w + 3]).toBe(0x40 * 1);
  });

  it('leaves ink-zero pixels untouched (OR semantics)', () => {
    const font = tinyFont();
    const w = 8;
    const dst = new Uint8Array(w * 4).fill(0);
    dst[0 * w + 0] = 0x07; // pre-existing pixel outside the glyph
    blitString(dst, w, 4, font, 'X', 1, 0, (level) => level);
    expect(dst[0]).toBe(0x07); // untouched
  });

  it('ORs into existing pixels rather than overwriting (prt uses |=)', () => {
    const font = tinyFont();
    const w = 8;
    const dst = new Uint8Array(w * 4);
    dst[0 * w + 1] = 0x08;
    // Glyph X row0 col0 (sheet col1) has ink 1; ink fn returns 0x01 → OR with 0x08 = 0x09.
    blitString(dst, w, 4, font, 'X', 1, 0, (level) => level);
    expect(dst[0 * w + 1]).toBe(0x09);
  });

  it('advances x by glyph width + gap between glyphs', () => {
    const font = tinyFont(); // X width 2, gap 2 → next glyph starts 4 px right
    const w = 16;
    const dst = new Uint8Array(w * 4);
    blitString(dst, w, 4, font, 'XY', 0, 0, () => 9);
    // X occupies cols 0-1; gap 2; Y (width1) at col 4. Y row0 sheet col4 ink 3 → painted at (4,0).
    expect(dst[0 * w + 0]).toBe(9);
    expect(dst[0 * w + 4]).toBe(9);
    expect(dst[0 * w + 2]).toBe(0); // gap stays blank
    expect(dst[0 * w + 3]).toBe(0);
  });

  it('clips out-of-bounds writes', () => {
    const font = tinyFont();
    const w = 4;
    const dst = new Uint8Array(w * 2);
    // Place near the right/bottom edge; must not throw or write OOB.
    expect(() => blitString(dst, w, 2, font, 'XY', 3, 1, () => 5)).not.toThrow();
  });
});

describe('blitStringCentered', () => {
  it('centres the string around cx (prtc: draw at cx - measure/2)', () => {
    const font = tinyFont();
    const w = 32;
    const dst = new Uint8Array(w * 4);
    const cx = 16;
    blitStringCentered(dst, w, 4, font, 'X', cx, 0, () => 7);
    // measure('X') = 2 + 2 = 4; start = 16 - 4/2 = 14. Glyph X cols 14-15.
    expect(dst[0 * w + 14]).toBe(7);
    expect(dst[0 * w + 15]).toBe(7);
  });
});

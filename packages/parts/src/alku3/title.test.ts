import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeU } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import { SCREEN_H, SCREEN_W } from './backdrop.js';
import { decodeHoi } from './hoi.js';
import {
  composeTitle,
  FONA_ORDER_TITLE,
  loadTitleFont,
  TEXT_BASE,
  TITLE_GLYPH_1,
  TITLE_GLYPH_2,
  TITLE_LINES,
} from './title.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

const font = loadTitleFont(decodeU(fixture('FONA.UH')));
const hoi = decodeHoi(fixture('HOI.U')).indices;

describe('loadTitleFont (title-aware FONA segmentation)', () => {
  it('exposes a 76-character order with the two title glyphs last', () => {
    expect([...FONA_ORDER_TITLE].length).toBe(76);
    expect(FONA_ORDER_TITLE.endsWith(TITLE_GLYPH_1 + TITLE_GLYPH_2)).toBe(true);
  });

  it('maps the two title glyphs onto the wide title bitmaps at the end of the sheet', () => {
    const g1 = font.glyphs.get(TITLE_GLYPH_1);
    const g2 = font.glyphs.get(TITLE_GLYPH_2);
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    // The title halves are far wider than the ~14-px letter glyphs.
    expect(g1?.width ?? 0).toBeGreaterThan(100);
    expect(g2?.width ?? 0).toBeGreaterThan(100);
    expect(g2?.x ?? 0).toBeGreaterThan(g1?.x ?? 0);
  });

  it('still resolves the "in" line letters', () => {
    expect(font.glyphs.get('i')).toBeDefined();
    expect(font.glyphs.get('n')).toBeDefined();
  });

  it('declares the title card lines from MAIN.C:71-74', () => {
    expect(TITLE_LINES.map((l) => l.y)).toEqual([120, 160, 179]);
    expect(TITLE_LINES[0]?.text).toBe('in');
  });
});

describe('composeTitle (MAIN.C prtc over hzpic)', () => {
  it('lays the HOI horizon (indices 0..63) under the title plane bands', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeTitle(buf, font, hoi, 0);
    let backdropPixels = 0;
    for (const v of buf) if (v < TEXT_BASE) backdropPixels++;
    expect(backdropPixels).toBeGreaterThan(0);
  });

  it('stamps the "in" + title text as plane-band indices (>= 0x40) ORed over the picture', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeTitle(buf, font, hoi, 0);
    let textPixels = 0;
    for (const v of buf) if (v >= TEXT_BASE) textPixels++;
    expect(textPixels).toBeGreaterThan(0);
  });

  it('centres the title around the screen midline', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeTitle(buf, font, hoi, 0);
    let minX = SCREEN_W;
    let maxX = -1;
    for (let y = 0; y < SCREEN_H; y++) {
      for (let x = 0; x < SCREEN_W; x++) {
        if ((buf[y * SCREEN_W + x] ?? 0) >= TEXT_BASE) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    expect(maxX).toBeGreaterThan(minX);
    const mid = (minX + maxX) / 2;
    expect(Math.abs(mid - SCREEN_W / 2)).toBeLessThan(40);
  });

  it('never writes out of bounds', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    expect(() => composeTitle(buf, font, hoi, 123)).not.toThrow();
    expect(buf.length).toBe(SCREEN_W * SCREEN_H);
  });
});

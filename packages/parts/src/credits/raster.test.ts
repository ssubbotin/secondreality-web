import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeU } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import { loadFona } from './font.js';
import { centerOffset } from './layout.js';
import { blitScanline, rasterField, SCREEN_H } from './raster.js';
import { contentHeight } from './scroll.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

const font = loadFona(decodeU(fixture('FONA.UH'), { glyphSheet: true }));
const DST_W = 640;

describe('blitScanline (do_scroll inner loop)', () => {
  it('draws ink only inside the centred glyph span', () => {
    const dst = new Uint8Array(DST_W * SCREEN_H);
    // 'A' is 21px wide; centred margin for a one-glyph line is centerOffset(21+gap)=centerOffset(23).
    const left = centerOffset(font.measure('A'));
    blitScanline(dst, DST_W, 0, font, 'A', 2); // font row 2 has solid ink
    const row = dst.subarray(0, DST_W);
    let first = -1;
    let last = -1;
    for (let x = 0; x < DST_W; x++) {
      if ((row[x] ?? 0) !== 0) {
        if (first < 0) first = x;
        last = x;
      }
    }
    expect(first).toBeGreaterThanOrEqual(left); // ink starts at/after the centred left margin
    expect(last).toBeLessThan(left + 21); // and ends within the glyph width
    // Ink levels are the 2-bit font values (1..3); the stray 63 lives only at row 0.
    for (let x = first; x <= last; x++) {
      const v = row[x] ?? 0;
      expect(v === 0 || (v >= 1 && v <= 3)).toBe(true);
    }
  });

  it('writes nothing for an all-empty font row of a glyph', () => {
    const dst = new Uint8Array(DST_W * SCREEN_H);
    blitScanline(dst, DST_W, 0, font, 'A', 15); // row 15 of 'A' is blank
    expect(dst.every((v) => v === 0)).toBe(true);
  });

  it('centres a single glyph around column ~319', () => {
    const dst = new Uint8Array(DST_W * SCREEN_H);
    blitScanline(dst, DST_W, 0, font, 'A', 2);
    const row = dst.subarray(0, DST_W);
    let first = -1;
    let last = -1;
    for (let x = 0; x < DST_W; x++) {
      if ((row[x] ?? 0) !== 0) {
        if (first < 0) first = x;
        last = x;
      }
    }
    const mid = (first + last) / 2;
    // The glyph centre should sit near screen centre (319.5), within the glyph half-width.
    expect(Math.abs(mid - 319.5)).toBeLessThan(21);
  });
});

describe('rasterField (full window)', () => {
  const lines = ['Here goes:', 'abcdefghijklmnopqrstuvwxyz'];
  const height = contentHeight(lines.length);

  it('fills a SCREEN_W×SCREEN_H buffer with only valid ink levels', () => {
    const dst = new Uint8Array(640 * SCREEN_H);
    rasterField(dst, font, lines, 0, height);
    for (const v of dst) expect(v === 0 || (v >= 1 && v <= 63)).toBe(true);
  });

  it('draws the first line near the top at frame 0 and scrolls it up by 1px/frame', () => {
    const a = new Uint8Array(640 * SCREEN_H);
    rasterField(a, font, lines, 0, height);
    // The first line occupies screen rows 0..29 at frame 0; find its top inked row.
    const topAt0 = firstInkRow(a);
    const b = new Uint8Array(640 * SCREEN_H);
    rasterField(b, font, lines, 5, height);
    const topAt5 = firstInkRow(b);
    // Scrolling up 5px moves the content's first inked row up by 5 (or the line scrolled off the top).
    expect(topAt0).toBeGreaterThanOrEqual(0);
    expect(topAt5).toBe(Math.max(0, topAt0 - 5));
  });
});

function firstInkRow(buf: Uint8Array): number {
  for (let row = 0; row < SCREEN_H; row++) {
    const base = row * 640;
    for (let x = 0; x < 640; x++) {
      if ((buf[base + x] ?? 0) !== 0) return row;
    }
  }
  return -1;
}

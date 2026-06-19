import type { DecodedU } from '../assets/decode-u.js';

/**
 * One segmented glyph cell in the font sheet. `x` is the start column; the cell spans `[x, x+width)`
 * across the full sheet height.
 */
export interface Glyph {
  ch: string;
  x: number;
  width: number;
}

/** A segmented bitmap font: the raw ink sheet plus a glyph table and metrics. */
export interface BitmapFont {
  /** The full ink sheet, row-major, values 0..3 (the original 2-bit font). */
  sheet: Uint8Array;
  /** Sheet width in pixels. */
  sheetWidth: number;
  /** Glyph height in pixels (full sheet height). */
  height: number;
  /** Character → glyph cell. */
  glyphs: Map<string, Glyph>;
  /** Per-glyph advance gap in pixels (the original `+2` of prt/addtext). */
  gap: number;
  /**
   * Rendered width of `text`: Σ (glyphWidth + gap), matching the original prt() advance. Unknown
   * characters contribute nothing (the original simply has no entry for them).
   */
  measure(text: string): number;
}

/**
 * The FONA glyph order (`MAIN.C:40`). The accented letters are Finnish credit text; in the original DOS
 * CP437 source they are the bytes 0x84 (ä), 0x94 (ö), 0x86 (å), 0x8F (é).
 */
export const FONA_ORDER =
  'ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789!?,.:äö()+-*=åé';

const DEFAULT_GAP = 2;

/** True if every row of column `x` in the sheet is ink-zero. */
function columnEmpty(sheet: Uint8Array, sheetWidth: number, height: number, x: number): boolean {
  for (let y = 0; y < height; y++) {
    if ((sheet[y * sheetWidth + x] ?? 0) !== 0) return false;
  }
  return true;
}

/**
 * Segment glyph columns out of a font sheet and pair them with `order`, reproducing MAIN.C init()
 * (`MAIN.C:214-233`): scan left→right, a glyph is a maximal run of non-empty columns separated by empty
 * columns; the n-th run maps to the n-th character of `order`.
 */
export function buildFont(
  sheet: Uint8Array,
  sheetWidth: number,
  height: number,
  order: string,
  opts: { gap?: number } = {},
): BitmapFont {
  const gap = opts.gap ?? DEFAULT_GAP;
  const glyphs = new Map<string, Glyph>();
  let x = 0;
  for (const ch of order) {
    if (x >= sheetWidth) break;
    // Skip leading empty columns.
    while (x < sheetWidth && columnEmpty(sheet, sheetWidth, height, x)) x++;
    const start = x;
    // Consume the non-empty run.
    while (x < sheetWidth && !columnEmpty(sheet, sheetWidth, height, x)) x++;
    if (x === start) break; // no more glyphs in the sheet
    glyphs.set(ch, { ch, x: start, width: x - start });
  }
  return makeFont(sheet, sheetWidth, height, glyphs, gap);
}

function makeFont(
  sheet: Uint8Array,
  sheetWidth: number,
  height: number,
  glyphs: Map<string, Glyph>,
  gap: number,
): BitmapFont {
  return {
    sheet,
    sheetWidth,
    height,
    glyphs,
    gap,
    measure(text: string): number {
      let w = 0;
      for (const ch of text) {
        const g = glyphs.get(ch);
        if (g) w += g.width + gap;
      }
      return w;
    },
  };
}

/**
 * Build the FONA font from a decoded FONA.UH: segment with FONA_ORDER, then add the forced space cell
 * (`MAIN.C:234-235` sets fonap[32]=1500-20, fonaw[32]=16 — a 16px blank at the far right of the sheet).
 */
export function loadFona(decoded: DecodedU): BitmapFont {
  const font = buildFont(decoded.indices, decoded.width, decoded.height, FONA_ORDER);
  font.glyphs.set(' ', { ch: ' ', x: decoded.width - 20, width: 16 });
  return font;
}

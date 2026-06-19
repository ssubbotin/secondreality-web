import type { DecodedU } from './decode-u.js';

/**
 * The ENDSCRL glyph order (`ENDSCRL/MAIN.C:13`). Note the uppercase run stops at `X` (no `Y`/`Z`) and the
 * lowercase run is full `a..z`, exactly as the original. The two CP437 `0x8F` bytes after the colon are the
 * accented `é`; the trailing glyph is an apostrophe. ENDSCROL.TXT contains only ASCII, so the accented
 * cells are never used here, but the order is reproduced verbatim so glyph positions match the original.
 */
export const FONA_ORDER =
  "ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789!?,.:éé()+-*='";

/** Font sheet height (FONAY in MAIN.C). */
export const FONAY = 30;

/** The inter-glyph advance gap (the `+2` of do_scroll's layout loop). */
const DEFAULT_GAP = 2;

/** One segmented glyph cell: `x` is the start column, the cell spans `[x, x+width)` across all 30 rows. */
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
  /** Glyph height in pixels (full sheet height = FONAY). */
  height: number;
  /** Character → glyph cell. */
  glyphs: Map<string, Glyph>;
  /** Per-glyph advance gap in pixels (the original `+2`). */
  gap: number;
  /**
   * Rendered width of `text`: Σ (glyphWidth + gap), matching the original `do_scroll` advance
   * (`tstart += fonaw[ch] + 2`). Characters with no glyph entry contribute nothing — the original simply
   * has no table entry for them (so e.g. `Y`, `Z`, `"`, `;` render as zero-width gaps, verbatim).
   */
  measure(text: string): number;
}

/** True if every row of column `x` in the sheet is ink-zero (matches `init()`'s all-rows-empty test). */
function columnEmpty(sheet: Uint8Array, sheetWidth: number, height: number, x: number): boolean {
  for (let y = 0; y < height; y++) {
    if ((sheet[y * sheetWidth + x] ?? 0) !== 0) return false;
  }
  return true;
}

/**
 * Segment glyph columns out of a font sheet and pair them with `order`, reproducing `init()`
 * (`MAIN.C:103-122`): scan left→right, a glyph is a maximal run of non-empty columns separated by empty
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
 * (`MAIN.C:123-124` sets `fonap[32]=1500-20, fonaw[32]=16` — a 16px blank at the far right of the sheet).
 */
export function loadFona(decoded: DecodedU): BitmapFont {
  const font = buildFont(decoded.indices, decoded.width, decoded.height, FONA_ORDER);
  font.glyphs.set(' ', { ch: ' ', x: decoded.width - 20, width: 16 });
  return font;
}

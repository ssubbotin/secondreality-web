/**
 * Local `.U`/`.UH` decoder + FONA bitmap-font segmentation for ALKU II.
 *
 * This part's branch is based on an engine commit that does not yet ship the text/asset layer
 * (`@sr/engine` exports no `decodeU` / `loadFona`). To stay self-contained and CI-green un-wired, the
 * minimal decode + font segmentation lives here. The format and segmentation are ported from the original
 * ALKU converter output and `MAIN.C init()`:
 *
 *   `.U`/`.UH`: 5×int16 LE header { magic=0xFCFC, wid, hig, cols, add }, then a 256×3 6-bit VGA palette,
 *   then `wid×hig` raw palette indices flush against EOF with a single trailing pad byte (verified for
 *   FONA.UH and HOI.U). The general format is per-row RLE; both paths are handled.
 *
 *   FONA segmentation (`MAIN.C:214-235`): scan the sheet left→right; a glyph is a maximal run of non-empty
 *   columns separated by empty columns; the n-th run maps to the n-th char of `FONA_ORDER`. A forced 16-px
 *   space cell is added at column `wid-20` (`fonap[32]=1500-20, fonaw[32]=16`).
 */

const HEADER_BYTES = 10;
const PALETTE_BYTES = 256 * 3;

/** A decoded `.U`/`.UH` picture: geometry, palette indices, and the 6-bit VGA palette. */
export interface DecodedU {
  width: number;
  height: number;
  cols: number;
  add: number;
  /** `width × height` palette indices, row-major, top row first. */
  indices: Uint8Array;
  /** 256 × 3 6-bit VGA RGB triples (0..63). */
  palette: Uint8Array;
}

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

function padPalette(palette: Uint8Array): Uint8Array {
  if (palette.length === PALETTE_BYTES) return palette.slice();
  const out = new Uint8Array(PALETTE_BYTES);
  out.set(palette.subarray(0, PALETTE_BYTES));
  return out;
}

/** Decode a `.U`/`.UH` buffer (`LBM2U.EXE` output) into geometry, indices and a 256-colour 6-bit palette. */
export function decodeU(buf: ArrayBuffer | Uint8Array): DecodedU {
  const data = toBytes(buf);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getInt16(2, true);
  const height = view.getInt16(4, true);
  const cols = view.getInt16(6, true);
  const add = view.getInt16(8, true);

  const palette = data.subarray(HEADER_BYTES, HEADER_BYTES + PALETTE_BYTES);
  const total = width * height;
  const indices = new Uint8Array(total);

  // Raw fast-path: uncompressed block flush against EOF with one trailing pad byte.
  const rawStart = data.length - total - 1;
  if (rawStart >= HEADER_BYTES + PALETTE_BYTES) {
    indices.set(data.subarray(rawStart, rawStart + total));
    return { width, height, cols, add, indices, palette: padPalette(palette) };
  }

  // Per-row RLE fallback.
  let off = HEADER_BYTES + PALETTE_BYTES;
  let out = 0;
  while (out < total && off < data.length) {
    const ctrl = data[off++] ?? 0;
    if (ctrl & 0x80) {
      const run = ctrl & 0x7f;
      const value = data[off++] ?? 0;
      for (let i = 0; i < run && out < total; i++) indices[out++] = value;
    } else {
      for (let i = 0; i < ctrl && out < total; i++) indices[out++] = data[off++] ?? 0;
    }
  }
  return { width, height, cols, add, indices, palette: padPalette(palette) };
}

/** One segmented glyph cell: start column `x`, spanning `[x, x+width)` across the full sheet height. */
export interface Glyph {
  ch: string;
  x: number;
  width: number;
}

/** A segmented 2-bit bitmap font: the ink sheet, the glyph table and metrics. */
export interface BitmapFont {
  /** The full ink sheet, row-major, values 0..3. */
  sheet: Uint8Array;
  sheetWidth: number;
  /** Glyph height in pixels (full sheet height). */
  height: number;
  glyphs: Map<string, Glyph>;
  /** Per-glyph advance gap (the original `+2`). */
  gap: number;
  /** Rendered width of `text`: Σ (glyphWidth + gap). Unknown chars contribute nothing. */
  measure(text: string): number;
}

/** FONA glyph order (`MAIN.C:40`); the accented letters are the CP437 bytes 0x84/0x94/0x86/0x8F. */
export const FONA_ORDER =
  'ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789!?,.:äö()+-*=åé';

const DEFAULT_GAP = 2;

function columnEmpty(sheet: Uint8Array, sheetWidth: number, height: number, x: number): boolean {
  for (let y = 0; y < height; y++) {
    if ((sheet[y * sheetWidth + x] ?? 0) !== 0) return false;
  }
  return true;
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
 * Segment glyph columns out of a font sheet and pair them with `order` (`MAIN.C:214-233`): scan left→right,
 * a glyph is a maximal run of non-empty columns separated by empty columns; the n-th run maps to the n-th
 * character of `order`.
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
    while (x < sheetWidth && columnEmpty(sheet, sheetWidth, height, x)) x++;
    const start = x;
    while (x < sheetWidth && !columnEmpty(sheet, sheetWidth, height, x)) x++;
    if (x === start) break;
    glyphs.set(ch, { ch, x: start, width: x - start });
  }
  return makeFont(sheet, sheetWidth, height, glyphs, gap);
}

/**
 * Build the FONA font from a decoded FONA.UH: segment with FONA_ORDER, then add the forced space cell
 * (`MAIN.C:234-235` sets fonap[32]=1500-20, fonaw[32]=16 — a 16-px blank at the far right of the sheet).
 */
export function loadFona(decoded: DecodedU): BitmapFont {
  const font = buildFont(decoded.indices, decoded.width, decoded.height, FONA_ORDER);
  font.glyphs.set(' ', { ch: ' ', x: decoded.width - 20, width: 16 });
  return font;
}

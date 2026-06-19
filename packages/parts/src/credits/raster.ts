import type { BitmapFont } from './font.js';
import { centerOffset, measureLine, SCREEN_W } from './layout.js';
import { rowToLineRow, scrollAt } from './scroll.js';

/** The visible scroll window height (px). The original wraps at 401 lines; 400 tiles the window cleanly. */
export const SCREEN_H = 400;

/**
 * Render one font scanline of `text` into screen row `screenRow` of the `dstW`-wide index buffer, porting
 * the `do_scroll` inner loop (`MAIN.C:77-88`). The line is centred via `centerOffset(measure(text))`; the
 * pen advances `+2` between glyphs (the inter-glyph gap, the `x+=2` of the outer for) and `+1` per glyph
 * column. The colour index written equals the 2-bit ink level (the original ORs plane bits 1/2 for values
 * ≤3, and the freshly-cleared scanbuf makes the XOR equivalent to a plain write). Ink level 0 is
 * transparent (background). Out-of-bounds columns are clipped.
 */
export function blitScanline(
  dst: Uint8Array,
  dstW: number,
  screenRow: number,
  font: BitmapFont,
  text: string,
  fontRow: number,
): void {
  let x = centerOffset(measureLine(font, text));
  const rowBase = fontRow * font.sheetWidth;
  const dstBase = screenRow * dstW;
  for (const ch of text) {
    const g = font.glyphs.get(ch);
    if (!g) continue;
    for (let b = 0; b < g.width; b++, x++) {
      if (x < 0 || x >= dstW) continue;
      const level = font.sheet[rowBase + g.x + b] ?? 0;
      if (level === 0) continue;
      dst[dstBase + x] = level;
    }
    x += font.gap; // the original `x+=2` between glyphs
  }
}

/**
 * Fill the full `SCREEN_W × SCREEN_H` visible window at sim-frame `frame`. Each screen row maps to a global
 * content row (`scroll + screenRow`), then to a `(lineIndex, fontRow)`; that one font row of the centred
 * line is blitted. Rows whose line index is outside the line list stay blank (the scroll's empty tail).
 * The buffer is cleared first (the original re-renders every scanline each frame).
 */
export function rasterField(
  dst: Uint8Array,
  font: BitmapFont,
  lines: readonly string[],
  frame: number,
  height: number,
): void {
  dst.fill(0);
  const scroll = scrollAt(frame, height);
  for (let screenRow = 0; screenRow < SCREEN_H; screenRow++) {
    const globalRow = scroll + screenRow;
    const wrapped = height > 0 ? globalRow % height : globalRow;
    const { lineIndex, fontRow } = rowToLineRow(wrapped);
    const text = lines[lineIndex];
    if (text === undefined) continue;
    blitScanline(dst, SCREEN_W, screenRow, font, text, fontRow);
  }
}

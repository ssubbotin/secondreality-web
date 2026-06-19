import type { BitmapFont } from './font.js';

/**
 * The chunky text scroll buffer, ported from ALKU `MAIN.C`. The original declares `char tbuf[186][352]`
 * (`MAIN.C:45`): a 352-wide × 186-tall byte buffer the credit lines are stamped into, then scrolled
 * horizontally into video memory by the XOR plane hack (`maketext`/`ascrolltext`). We stamp the same chunky
 * buffer and scroll the *visible result* directly (see the design doc — the XOR telescopes to a plain
 * horizontal translate).
 */
export const TBUF_W = 352;
export const TBUF_H = 186;

/** The original text is centred on screen-x 160 (the `addtext(160, …)` calls, `MAIN.C:103-128`). */
export const CENTER_X = 160;

/**
 * The original `font[y][...]` ink is pre-remapped in `init()` (`MAIN.C:169-182`) from the 2-bit level to a
 * VGA plane byte: `1→0x40, 2→0x80, 3→0xC0, 0→0`. The engine's `font.sheet` keeps the raw 0..3 level, so we
 * apply the same remap here when stamping `tbuf`.
 */
export function inkPlaneByte(level: number): number {
  return (level & 3) * 0x40;
}

/** Allocate a zeroed text buffer of the original geometry. */
export function makeTextBuffer(): Uint8Array {
  return new Uint8Array(TBUF_W * TBUF_H);
}

/**
 * Port of `addtext(tx,ty,txt)` (`MAIN.C:324-340`): stamp a credit line into `tbuf`, horizontally centred on
 * `tx`. The original computes the full pixel width `w = Σ(fonaw[ch]+2)`, halves it (integer truncation),
 * then writes each glyph column `font[y][fonap[ch]+x]` to `tbuf[y+ty][tx+x-w]` for the 30 font rows. The
 * write is a plain assignment (not OR) in the original; we keep that, clipping out-of-bounds columns/rows.
 *
 * `tx` is the centre x; `ty` the top row. Glyph ink is mapped to the plane byte via `inkPlaneByte`.
 */
export function addText(
  tbuf: Uint8Array,
  font: BitmapFont,
  tx: number,
  ty: number,
  text: string,
): void {
  // w = Σ(glyphWidth + gap); w /= 2 (C integer truncation toward zero).
  const w = Math.trunc(font.measure(text) / 2);
  let penX = tx;
  for (const ch of text) {
    const g = font.glyphs.get(ch);
    if (!g) continue;
    for (let x = 0; x < g.width; x++) {
      const dx = penX + x - w;
      if (dx < 0 || dx >= TBUF_W) continue;
      const sheetCol = g.x + x;
      for (let y = 0; y < font.height; y++) {
        const dy = y + ty;
        if (dy < 0 || dy >= TBUF_H) continue;
        const level = font.sheet[y * font.sheetWidth + sheetCol] ?? 0;
        tbuf[dy * TBUF_W + dx] = inkPlaneByte(level);
      }
    }
    penX += g.width + font.gap;
  }
}

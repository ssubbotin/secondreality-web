import type { BitmapFont } from './font.js';

/**
 * Maps a font ink level (0..3 from the sheet) to a destination palette index. The original ALKU remaps
 * the 2-bit font value to a VGA plane intensity (`1/2/3 → 0x40/0x80/0xC0`, MAIN.C:169-182) before ORing
 * it into video memory; a part supplies its own mapping here so the same glyph sheet can drive different
 * palettes. Level 0 is always treated as transparent and never written.
 */
export type InkFn = (level: number) => number;

/**
 * Blit `text` into the `dstW × dstH` index buffer at top-left (x, y), porting `prt()` (MAIN.C:272-291):
 * each glyph's ink is OR-combined into the destination (so overlapping glyphs / existing pixels merge),
 * and x advances by `glyphWidth + font.gap` per glyph. Out-of-bounds pixels are clipped. Unknown
 * characters are skipped (the original simply has no table entry).
 */
export function blitString(
  dst: Uint8Array,
  dstW: number,
  dstH: number,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  ink: InkFn,
): void {
  let penX = x;
  for (const ch of text) {
    const g = font.glyphs.get(ch);
    if (!g) continue;
    for (let gx = 0; gx < g.width; gx++) {
      const dx = penX + gx;
      if (dx < 0 || dx >= dstW) continue;
      const sheetCol = g.x + gx;
      for (let gy = 0; gy < font.height; gy++) {
        const dy = y + gy;
        if (dy < 0 || dy >= dstH) continue;
        const level = font.sheet[gy * font.sheetWidth + sheetCol] ?? 0;
        if (level === 0) continue;
        const di = dy * dstW + dx;
        dst[di] = (dst[di] ?? 0) | ink(level);
      }
    }
    penX += g.width + font.gap;
  }
}

/**
 * Centred blit, porting `prtc()` (MAIN.C:293-299): draw `text` starting at `cx - measure(text)/2` so it
 * is horizontally centred on `cx`. Integer division truncates toward zero, matching the C `w/2`.
 */
export function blitStringCentered(
  dst: Uint8Array,
  dstW: number,
  dstH: number,
  font: BitmapFont,
  text: string,
  cx: number,
  y: number,
  ink: InkFn,
): void {
  const start = cx - Math.trunc(font.measure(text) / 2);
  blitString(dst, dstW, dstH, font, text, start, y, ink);
}

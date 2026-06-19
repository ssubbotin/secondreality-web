import { type BitmapFont, buildFont, type DecodedU } from '@sr/engine';

/**
 * The ENDSCRL credits font: the engine's shared bitmap-font segmentation (`buildFont`/`BitmapFont`/`Glyph`)
 * driven by the ENDSCRL-specific glyph order. Only the order string and the forced space cell differ from
 * the ALKU FONA (`@sr/engine`'s `FONA_ORDER`/`loadFona`), so the segmentation engine is shared and only
 * those two pieces live here.
 */
export type { BitmapFont, Glyph } from '@sr/engine';
export { buildFont } from '@sr/engine';

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

/**
 * Build the ENDSCRL credits font from a decoded FONA.UH: segment with `FONA_ORDER` (the shared engine
 * `buildFont`), then add the forced space cell (`MAIN.C:123-124` sets `fonap[32]=1500-20, fonaw[32]=16` —
 * a 16px blank at the far right of the sheet).
 */
export function loadFona(decoded: DecodedU): BitmapFont {
  const font = buildFont(decoded.indices, decoded.width, decoded.height, FONA_ORDER);
  font.glyphs.set(' ', { ch: ' ', x: decoded.width - 20, width: 16 });
  return font;
}

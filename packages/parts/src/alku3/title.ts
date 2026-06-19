import type { BitmapFont, DecodedU } from '@sr/engine';
import { blitStringCentered, buildFont } from '@sr/engine';
import { composeBackdrop, SCREEN_H, SCREEN_W } from './backdrop.js';

/** Glyph ink levels 1/2/3 map onto plane bands 0x40 / 0x80 / 0xC0. */
export const TEXT_BASE = 0x40;

/** The cards are centred on screen-x 160 (the original `prtc(160, …)`). */
const CENTER_X = 160;

/**
 * The two FONA glyph keys for the SECOND REALITY title bitmap. In the original `fonaorder`
 * (`ALKU/MAIN.C:40`) the last two glyphs are CP437 bytes `0x8F` / `0x99`, drawn by the title card
 * (`prtc(160,160,"\x8f"); prtc(160,179,"\x99")`, `MAIN.C:73-74`). They are the two 215-px-wide halves of
 * the title at the far right of the FONA sheet. We address them with sentinel keys so the segmentation
 * pairs the n-th glyph run with the n-th order character.
 */
export const TITLE_GLYPH_1 = '①'; // ① — first title half (CP437 0x8F)
export const TITLE_GLYPH_2 = '②'; // ② — second title half (CP437 0x99)

/**
 * The faithful 76-character FONA order (`ALKU/MAIN.C:40`), with the trailing apostrophe and the two title
 * glyphs preserved so the segmentation lands the wide title bitmaps on the last two runs. The accented
 * letters (`äö`) are CP437 0x8F duplicates in the source; only their slot positions matter for downstream
 * letters, so we keep distinct placeholders to preserve the run count.
 */
export const FONA_ORDER_TITLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789!?,.:äö()+-*='" +
  TITLE_GLYPH_1 +
  TITLE_GLYPH_2;

/** Segment the FONA sheet with the title-aware order so the two title glyphs are reachable. */
export function loadTitleFont(decoded: DecodedU): BitmapFont {
  const font = buildFont(decoded.indices, decoded.width, decoded.height, FONA_ORDER_TITLE);
  font.glyphs.set(' ', { ch: ' ', x: decoded.width - 20, width: 16 });
  return font;
}

/**
 * The three lines of the title card (`ALKU/MAIN.C:71-74`): `prtc(160,120,"in")`,
 * `prtc(160,160,<title-half-1>)`, `prtc(160,179,<title-half-2>)`. The y's are the original `prtc`
 * coordinates; the two title halves stack to form the full SECOND REALITY title bitmap.
 */
export const TITLE_LINES: { text: string; y: number }[] = [
  { text: 'in', y: 120 },
  { text: TITLE_GLYPH_1, y: 160 },
  { text: TITLE_GLYPH_2, y: 179 },
];

/**
 * Compose one title-reveal frame: the HOI horizon backdrop window, then the "in" line and the two-glyph
 * title stamped on top by ORing the font plane byte (`0x40/0x80/0xC0`) into the picture index — exactly as
 * `MAIN.C` `prtc()` ORs the text plane into video memory. `dst` is overwritten each call.
 */
export function composeTitle(
  dst: Uint8Array,
  font: BitmapFont,
  hoi: Uint8Array,
  backdropOffsetPx: number,
): void {
  composeBackdrop(dst, hoi, backdropOffsetPx);
  const ink = (level: number): number => TEXT_BASE * (level & 3);
  for (const line of TITLE_LINES) {
    blitStringCentered(dst, SCREEN_W, SCREEN_H, font, line.text, CENTER_X, line.y, ink);
  }
}

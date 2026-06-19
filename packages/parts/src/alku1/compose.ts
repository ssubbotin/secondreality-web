import type { BitmapFont } from '@sr/engine';
import { blitStringCentered } from '@sr/engine';
import { composeBackdrop, SCREEN_H, SCREEN_W } from './copper.js';
import { TEXT_BASE } from './palette.js';
import type { RevealState } from './reveal.js';
import { CARDS } from './reveal.js';

/** The cards are centred on screen-x 160 (the original `prtc(160, …)`). */
const CENTER_X = 160;

/**
 * Build the 320×200 index buffer for one opening frame: lay the HOI horizon backdrop across every scanline
 * (panned by `backdropOffset`), then stamp the active card's centred text on top by ORing the font plane
 * byte (`0x40/0x80/0xC0`) into the picture index — exactly as `MAIN.C` `prtc()` ORs the text plane into
 * video memory (`MAIN.C:272-291`). A lit text pixel reads palette index `band | pictureColour`.
 *
 * The card's appearance/disappearance is carried by the **palette** `dofade` (black → palette2 → black),
 * not the index buffer, so the text is always stamped while a card is active and simply renders black when
 * the palette is faded down. `composeFrame` overwrites the whole buffer each call (no accumulation).
 */
export function composeFrame(
  dst: Uint8Array,
  font: BitmapFont,
  hoi: Uint8Array,
  reveal: RevealState,
  backdropOffsetPx: number,
): void {
  // HOI horizon backdrop window across every scanline.
  composeBackdrop(dst, hoi, backdropOffsetPx);

  // Active card text: ink level 1/2/3 → plane band 0x40/0x80/0xC0 ORed into the picture index.
  const card = CARDS[reveal.card];
  if (!card) return;
  const ink = (level: number): number => TEXT_BASE * (level & 3);
  for (let i = 0; i < card.lines.length; i++) {
    const line = card.lines[i] ?? '';
    const y = card.ys[i] ?? 0;
    blitStringCentered(dst, SCREEN_W, SCREEN_H, font, line, CENTER_X, y, ink);
  }
}

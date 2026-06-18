import type { BitmapFont } from '@sr/engine';
import { blitStringCentered } from '@sr/engine';
import { copperRowIndex, SCREEN_H, SCREEN_W } from './copper.js';
import { TEXT_BASE } from './palette.js';
import type { RevealState } from './reveal.js';
import { CARDS } from './reveal.js';

/** The cards are centred on screen-x 160 (the original prtc(160, …)). */
const CENTER_X = 160;

/**
 * Build the 320×200 index buffer for one opening frame: lay the copper backdrop across every scanline,
 * then stamp the active card's centred text on top (porting MAIN.C's `prtc` of each line). The card's
 * fade is carried by the palette (`lerpPalette` of the text ramp) — when `level` is 0 the text would map
 * to black, so we simply skip stamping it, keeping the index buffer clean. `composeFrame` overwrites the
 * whole buffer each call (no accumulation between frames).
 */
export function composeFrame(
  dst: Uint8Array,
  font: BitmapFont,
  reveal: RevealState,
  copperFrame: number,
): void {
  // Copper backdrop: every pixel on a scanline takes that line's band index.
  for (let y = 0; y < SCREEN_H; y++) {
    const idx = copperRowIndex(y, copperFrame);
    const row = y * SCREEN_W;
    dst.fill(idx, row, row + SCREEN_W);
  }

  if (reveal.level <= 0) return;

  // Active card text: ink level 1/2/3 → palette index TEXT_BASE+level (matches the original plane band).
  const card = CARDS[reveal.card];
  if (!card) return;
  const ink = (level: number): number => TEXT_BASE + level;
  for (let i = 0; i < card.lines.length; i++) {
    const line = card.lines[i] ?? '';
    const y = card.ys[i] ?? 0;
    blitStringCentered(dst, SCREEN_W, SCREEN_H, font, line, CENTER_X, y, ink);
  }
}

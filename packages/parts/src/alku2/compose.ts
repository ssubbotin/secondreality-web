import { backdropOffset, HOI_W, SCREEN_H, SCREEN_W, sampleBackdropRow } from './copper.js';
import { TBUF_H, TBUF_W } from './text-buffer.js';

/**
 * Composite one 320×200 opening frame: the HOI backdrop window first, then the scrolled chunky text band
 * ORed on top — the visible result of ALKU's `do_scroll` (backdrop CRTC pan, `MAIN.C:403-409`) plus the XOR
 * text scroll (`ascrolltext`, telescoped to a plain horizontal translate; see the design doc). The text
 * plane bytes (`0x40/0x80/0xC0`) OR into the picture index so a lit pixel reads palette index
 * `band | pictureColour`, exactly as the original ORs the text plane into video memory.
 */

/**
 * Where the text band sits in the 200-line field. The original text region is 184 rows tall (rows 1..184 of
 * `tbuf`); we centre that band vertically in the 200-line visible field. `TEXT_BAND_Y` is the screen row of
 * `tbuf` row 0.
 */
export const TEXT_BAND_Y = Math.trunc((SCREEN_H - TBUF_H) / 2);

/**
 * Screen-x of `tbuf` column 0 for a given horizontal `textScroll`. The credit card is stamped centred in the
 * 352-wide `tbuf`; as `textScroll` advances the whole buffer slides left across the screen (text enters from
 * the right, exits left), matching `ascrolltext` advancing its write offset with `a`.
 *
 * At `textScroll = 0` the buffer's left edge sits at the screen's right edge (`SCREEN_W`), so the centred
 * card is just off-screen right; it scrolls fully off the left when `textScroll = SCREEN_W + TBUF_W`.
 */
export function textOriginX(textScroll: number): number {
  return SCREEN_W - textScroll;
}

/**
 * Lay the HOI backdrop window across every scanline of `dst` (320×200), starting at pixel `offset` into the
 * 640-wide source and wrapping. `dst` is overwritten (no accumulation between frames).
 */
export function composeBackdrop(dst: Uint8Array, hoi: Uint8Array, offset: number): void {
  const off = ((offset % HOI_W) + HOI_W) % HOI_W;
  const row = new Uint8Array(SCREEN_W);
  for (let y = 0; y < SCREEN_H; y++) {
    sampleBackdropRow(row, hoi, y, off);
    dst.set(row, y * SCREEN_W);
  }
}

/**
 * OR the chunky text buffer into `dst` at horizontal position `textScroll`. Each non-zero `tbuf` byte is a
 * plane byte (`0x40/0x80/0xC0`) ORed into the existing picture index (`MAIN.C` ORs the text plane into vmem).
 * Rows map `tbuf` row → screen row `TEXT_BAND_Y + row`; columns map via `textOriginX`. Out-of-bounds pixels
 * are clipped.
 */
export function composeText(dst: Uint8Array, tbuf: Uint8Array, textScroll: number): void {
  const originX = textOriginX(textScroll);
  for (let ty = 0; ty < TBUF_H; ty++) {
    const sy = TEXT_BAND_Y + ty;
    if (sy < 0 || sy >= SCREEN_H) continue;
    const srcBase = ty * TBUF_W;
    const dstBase = sy * SCREEN_W;
    for (let tx = 0; tx < TBUF_W; tx++) {
      const ink = tbuf[srcBase + tx] ?? 0;
      if (ink === 0) continue;
      const sx = originX + tx;
      if (sx < 0 || sx >= SCREEN_W) continue;
      const di = dstBase + sx;
      dst[di] = (dst[di] ?? 0) | ink;
    }
  }
}

/**
 * Full frame composite: backdrop window at `backdropScroll`, then the text band at `textScroll`. The
 * caller (the Effect) passes the scroll value through `backdropOffset` for the backdrop pan.
 */
export function composeFrame(
  dst: Uint8Array,
  hoi: Uint8Array,
  tbuf: Uint8Array,
  backdropScroll: number,
  textScroll: number,
): void {
  composeBackdrop(dst, hoi, backdropOffset(backdropScroll));
  composeText(dst, tbuf, textScroll);
}

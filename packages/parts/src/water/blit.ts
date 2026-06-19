import { FRAME_RECORDS, SCREEN_PIXELS, type WatFrame } from './wat-data.js';

/**
 * `waterBlit` — the port of `Putrouts1` (`WATER/ROUTINES.ASM`), the WATER part's only raster primitive.
 *
 * Original (large model, PASCAL calling convention):
 *
 *   gs = tausta (background) seg, fs = font/scroll seg, bx = fbuf offset, ds:si = WAT*.DAT
 *   es = 0A000h (screen), dx = 158*34 (cell counter)
 *   @a1: lodsw                    ; ax = count
 *        or ax,ax / je @no1
 *        cx = ax
 *        @b1: lodsw               ; di = screen offset
 *             al = fs:[bx]        ; font/scroll pixel
 *             or al,al / jne @y   ; if non-zero, use it...
 *             al = gs:[di]        ; ...else the background pixel at the same screen offset
 *        @y:  es:[di] = al        ; write to screen
 *             loop @b1
 *   @no1: inc bx                  ; next scroll-buffer cell
 *         dec dx / jnz @a1
 *
 * The reflection/ripple is entirely in the baked position sets of each WAT frame; empty scroll cells copy
 * the background straight through, so the visible warp is the scroll text streaming across the rippled
 * water while the still mirror-ball backdrop shows everywhere else.
 *
 * @param out   320×200 palette-index screen buffer (already a copy of the background; see below).
 * @param bg    320×200 background palette indices (`tausta`), read at the *destination* offset.
 * @param frame the parsed WAT frame (5372 records).
 * @param fbuf  the flat scroll buffer the records index by cell (`bx`).
 */
export function waterBlit(
  out: Uint8Array,
  bg: Uint8Array,
  frame: WatFrame,
  fbuf: Uint8Array,
): void {
  const records = frame.records;
  const n = Math.min(records.length, FRAME_RECORDS);
  for (let bx = 0; bx < n; bx++) {
    const rec = records[bx];
    if (rec === undefined) continue;
    const fbyte = fbuf[bx] ?? 0;
    const pos = rec.pos;
    const count = rec.count;
    for (let i = 0; i < count; i++) {
      const di = pos[i] ?? 0;
      if (di >= SCREEN_PIXELS) continue; // defensive: original would read OOB; our data never does
      out[di] = fbyte !== 0 ? fbyte : (bg[di] ?? 0);
    }
  }
}

/**
 * Compose one full WATER frame into `out`: start as a copy of the background (the demo `move`s `tausta`
 * to the screen each scene), then overlay the rippled scroll via `waterBlit`. Equivalent to the original
 * because empty scroll cells write `bg[di]` anyway — the explicit background copy fills every pixel the
 * current WAT frame does not touch.
 */
export function composeWaterFrame(
  out: Uint8Array,
  bg: Uint8Array,
  frame: WatFrame,
  fbuf: Uint8Array,
): void {
  out.set(bg);
  waterBlit(out, bg, frame, fbuf);
}

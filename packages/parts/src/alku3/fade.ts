/**
 * The ALKU picture-reveal fade and the closing cross-fade, ported verbatim.
 *
 * Reveal (the "picture flash", `ALKU/MAIN.C:79-86, 237-242` + `ALKU/COPPER.ASM:115-145`):
 *   init():  picin[a] = (palette[a] - fade1[a]) * 256 / 128;     // fade1 == 0  =>  palette[a]*256/128
 *   sync 4:  memcpy(fadepal, fade1, 768); cop_fadepal = picin; cop_dofade = 128;
 *   copper3: each of 128 frames adds the 16-bit `picin` delta into a per-byte 16-bit accumulator
 *            (`fadepal` = high bytes : low bytes); the high byte is the live 6-bit DAC value.
 * After `step` frames the accumulator high byte is `(step * picin[a]) >> 8`. At step 0 every byte is 0
 * (black); at step 128 it is exactly `palette[a]` (since `128 * palette[a]*256/128 = palette[a]*256`).
 *
 * Closing fade (`ALKU/MAIN.C:147-149, 301-312`, `dofade`):
 *   pal[b] = (pal1[b]*(64-a) + pal2[b]*a) >> 6,  a = 0..63    // a 64-step linear cross-fade
 *
 * All inputs/outputs are 6-bit (0..63) VGA DAC palettes (768 bytes = 256 RGB triples). C integer
 * division truncates toward zero (`Math.trunc`); `>>` already truncates. The 16-bit accumulator cannot
 * overflow here: its peak is `palette[a]*256 <= 63*256 = 16128 < 32768`.
 */

/** Number of reveal frames (step = 0..128 inclusive), one per `dis_waitb()` in the original. */
export const REVEAL_STEPS = 129;
/** Number of closing-fade steps (a = 0..63), matching `dofade`'s `for(a=0;a<64;a++)`. */
export const CLOSING_STEPS = 64;

const PAL_BYTES = 768;

/**
 * Build the per-byte 16-bit `picin` delta from a 6-bit picture palette (`MAIN.C:241`, `fade1 == 0`):
 * `picin[a] = palette6[a] * 256 / 128`. Returns a fresh `Int16Array` (the original `int picin[768]`).
 */
export function computePicin(palette6: Uint8Array): Int16Array {
  const out = new Int16Array(PAL_BYTES);
  for (let a = 0; a < PAL_BYTES; a++) {
    out[a] = Math.trunc(((palette6[a] ?? 0) * 256) / 128);
  }
  return out;
}

/**
 * The 6-bit palette at reveal frame `step` (0..128) of the 128-step incremental fade. Reproduces the
 * COPPER.ASM accumulator: after `step` adds of `picin`, the live high byte is `(step * picin[a]) >> 8`.
 * `step` is clamped into [0, 128]. Returns a fresh 768-byte palette.
 */
export function revealStep(step: number, palette6: Uint8Array): Uint8Array {
  const s = step < 0 ? 0 : step > 128 ? 128 : step;
  const picin = computePicin(palette6);
  const out = new Uint8Array(PAL_BYTES);
  for (let a = 0; a < PAL_BYTES; a++) {
    // accumulator = s * picin[a]; the DAC value is the high byte (>>8). Matches the per-frame 16-bit add.
    out[a] = (s * (picin[a] ?? 0)) >> 8;
  }
  return out;
}

/**
 * One frame of `dofade` (`MAIN.C:306-310`): the 64-step linear cross-fade from `pal1` to `pal2` at step
 * `a` (0..63), `out[b] = (pal1[b]*(64-a) + pal2[b]*a) >> 6`. `a` is clamped into [0, 63]; at a=0 the
 * output is `pal1`, at a=63 it is `~pal2`. Returns a fresh 768-byte 6-bit palette.
 */
export function closingFadeStep(a: number, pal1: Uint8Array, pal2: Uint8Array): Uint8Array {
  const aa = a < 0 ? 0 : a > 63 ? 63 : a;
  const out = new Uint8Array(PAL_BYTES);
  for (let b = 0; b < PAL_BYTES; b++) {
    out[b] = ((pal1[b] ?? 0) * (64 - aa) + (pal2[b] ?? 0) * aa) >> 6;
  }
  return out;
}

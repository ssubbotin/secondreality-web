/**
 * The standalone picture-flash timeline for ALKU's final reveal. The original (`MAIN.C:79-86`) fades a
 * single backdrop picture in over 128 frames; here, to exercise all four shipped reveal pictures in the
 * lab, alku3 cycles them, each running the same reveal-in (128) → hold → close (64) cadence the original
 * uses, then loops. The reveal/close math is the original's, frame-for-frame (see `fade.ts`); only the
 * outer "cycle the pictures" loop is added for the standalone preview.
 *
 * Phases per picture:
 *   reveal  — frames [0, 128]            : `revealStep(local)` fades black → the picture palette
 *   hold    — frames (128, 128+HOLD]     : the picture palette holds at full
 *   close   — frames (128+HOLD, +64]     : `closingFadeStep` fades the picture palette → black
 */

import { REVEAL_PICTURES, type RevealPictureName } from './lbm.js';

/** Frames the reveal fade-in occupies (step 0..128 inclusive, 129 frames). */
export const REVEAL_FRAMES = 129;
/** Frames each picture holds at full brightness before closing (~a musical beat at 70 Hz). */
export const HOLD_FRAMES = 210;
/** Frames the closing fade-out occupies (the 64-step `dofade`). */
export const CLOSE_FRAMES = 64;

/** Total frames one picture occupies in the cycle. */
export const PICTURE_SPAN = REVEAL_FRAMES + HOLD_FRAMES + CLOSE_FRAMES;
/** Total timeline length (all four pictures), used for the lab self-loop. */
export const TIMELINE_FRAMES = REVEAL_PICTURES.length * PICTURE_SPAN;

export type FlashPhase = 'reveal' | 'hold' | 'close';

export interface FlashState {
  /** Index into REVEAL_PICTURES of the picture currently showing. */
  pictureIndex: number;
  /** Name of the picture currently showing. */
  picture: RevealPictureName;
  /** Current phase of that picture's flash. */
  phase: FlashPhase;
  /** Reveal step 0..128 (meaningful in 'reveal'; pinned at 128 during 'hold'/'close'). */
  revealStep: number;
  /** Closing step 0..63 (meaningful in 'close'; 0 otherwise). */
  closeStep: number;
}

/** Resolve which picture is showing and its fade phase/step at sim-frame `frame` (looping). */
export function flashAt(frame: number): FlashState {
  const total = TIMELINE_FRAMES;
  const f = ((frame % total) + total) % total;
  const pictureIndex = Math.floor(f / PICTURE_SPAN);
  const local = f - pictureIndex * PICTURE_SPAN;
  const picture = REVEAL_PICTURES[pictureIndex] ?? REVEAL_PICTURES[0];

  if (local < REVEAL_FRAMES) {
    return { pictureIndex, picture, phase: 'reveal', revealStep: local, closeStep: 0 };
  }
  if (local < REVEAL_FRAMES + HOLD_FRAMES) {
    return { pictureIndex, picture, phase: 'hold', revealStep: 128, closeStep: 0 };
  }
  const closeStep = local - (REVEAL_FRAMES + HOLD_FRAMES);
  return {
    pictureIndex,
    picture,
    phase: 'close',
    revealStep: 128,
    closeStep: closeStep > 63 ? 63 : closeStep,
  };
}

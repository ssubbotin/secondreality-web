/**
 * The title-card reveal timeline — the deterministic port of ALKU's third presentation card
 * (`dis_sync<3`, `ALKU/MAIN.C:71-77`): `prtc(160,120,"in")`, the two-glyph SECOND REALITY title, then
 * `dofade(black→text)` (64 steps), `wait(300)`, `dofade(text→black)` (64 steps). The original gates the
 * card on `dis_sync` (the music order/row); here it runs on the fixed-timestep accumulator so the cadence
 * is reproducible and fps-independent, looping in the lab.
 *
 * `level` is the 0..64 fade position (0 = black, 64 = full picture+title), fed straight into `lerpPalette`.
 */

/** dofade is a 64-step linear cross-fade (`MAIN.C:306`). */
export const FADE_STEPS = 64;
/** wait(300) — the ~300-frame hold between fade-in and fade-out (`MAIN.C:74`). */
export const HOLD_FRAMES = 300;

/** Total timeline length (fade-in + hold + fade-out), used for the lab self-loop. */
export const TIMELINE_FRAMES = FADE_STEPS + HOLD_FRAMES + FADE_STEPS;

export interface RevealState {
  /** Fade position 0..64 (0 = black, 64 = full picture+title). */
  level: number;
}

/** Resolve the title fade level at sim-frame `frame`, looping over the timeline. */
export function revealAt(frame: number): RevealState {
  const f = ((frame % TIMELINE_FRAMES) + TIMELINE_FRAMES) % TIMELINE_FRAMES;
  let level: number;
  if (f < FADE_STEPS) {
    level = f; // fade in
  } else if (f < FADE_STEPS + HOLD_FRAMES) {
    level = 64; // hold
  } else {
    level = 64 - (f - FADE_STEPS - HOLD_FRAMES); // fade out
  }
  if (level < 0) level = 0;
  if (level > 64) level = 64;
  return { level };
}

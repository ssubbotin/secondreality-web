/**
 * The opening reveal timeline — the deterministic port of the presentation cards at the head of ALKU
 * (`MAIN.C:61-71`). Part #1 covers the first two `dis_sync` cards: the "A / Future Crew / Production"
 * card (`dis_sync<1`, `MAIN.C:61-64`) and the "First Presented / at Assembly 93" card (`dis_sync<2`,
 * `MAIN.C:66-69`). The third card — "in" + the two-glyph SECOND REALITY title (`dis_sync<3`,
 * `MAIN.C:71-77`) — is the reveal handled by part #3 (alku3).
 *
 * Each card runs `prtc` of its lines, then `dofade(black→text)` (64 steps), `wait(300)`,
 * `dofade(text→black)` (64 steps). The original gates the start of each card on `dis_sync` (the music
 * order/row); here the cards run back-to-back on the fixed-timestep accumulator so the cadence is
 * reproducible and fps-independent, and the whole timeline self-loops in the lab.
 *
 * `level` is the 0..64 fade position (0 = black, 64 = full picture+text), fed straight into `lerpPalette`.
 */

/** dofade is a 64-step linear cross-fade (MAIN.C:306). */
export const FADE_STEPS = 64;
/** wait(300) — the ~300-frame hold between fade-in and fade-out (MAIN.C:64). */
export const HOLD_FRAMES = 300;

/** One opening card: a stack of centred lines (drawn around screen-x 160). */
export interface Card {
  /** Centred text lines, top to bottom. */
  lines: string[];
  /** Screen y of each line (the original's per-line y from MAIN.C). */
  ys: number[];
}

/**
 * The two presentation cards part #1 owns (`MAIN.C:61-69`). Line y's are the original `prtc` screen
 * coordinates. (The third "in / title" card, `MAIN.C:71-77`, is part #3.)
 */
export const CARDS: Card[] = [
  { lines: ['A', 'Future Crew', 'Production'], ys: [120, 160, 200] },
  { lines: ['First Presented', 'at Assembly 93'], ys: [160, 200] },
];

/** Frames occupied by one card: fade-in + hold + fade-out. */
const CARD_SPAN = FADE_STEPS + HOLD_FRAMES + FADE_STEPS;

/** Total timeline length (all cards), used for the lab self-loop. */
export const TIMELINE_FRAMES = CARDS.length * CARD_SPAN;

export interface RevealState {
  /** Index into CARDS of the card currently showing. */
  card: number;
  /** Fade position 0..64 (0 = black, 64 = full text). */
  level: number;
}

/** Resolve which card is showing and its fade level at sim-frame `frame` (looping over the timeline). */
export function revealAt(frame: number): RevealState {
  const f = ((frame % TIMELINE_FRAMES) + TIMELINE_FRAMES) % TIMELINE_FRAMES;
  const card = Math.floor(f / CARD_SPAN);
  const local = f - card * CARD_SPAN;
  let level: number;
  if (local < FADE_STEPS) {
    level = local; // fade in
  } else if (local < FADE_STEPS + HOLD_FRAMES) {
    level = 64; // hold
  } else {
    level = 64 - (local - FADE_STEPS - HOLD_FRAMES); // fade out
  }
  if (level < 0) level = 0;
  if (level > 64) level = 64;
  return { card, level };
}

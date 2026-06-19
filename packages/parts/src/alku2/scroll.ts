/**
 * The credit-scroll state machine, ported from ALKU `MAIN.C` section 2 (the horizontal scroller,
 * `MAIN.C:79-152`). The original marches a pixel counter `a` from 1 to ~320 at `SCRLF` vblanks per step
 * (`do_scroll`, `MAIN.C:397-412`) and swaps successive credit cards into the scroll buffer as the music
 * order advances (`dis_sync()`), `tptr` cycling 0..4 (`MAIN.C:102-137`). We reproduce the same march and
 * card sequence on a deterministic, looping schedule (no music dependency in the lab).
 */

/** `SCRLF` (`MAIN.C:7`): vblanks per one-pixel scroll step. */
export const SCRLF = 9;

/** The scroll marches `a` across this many pixels before looping (the original `a<320`, `MAIN.C:87`). */
export const SCROLL_SPAN = 320;

/** One credit card: stacked centred lines with their original screen-y (`MAIN.C:103-128`). */
export interface CreditCard {
  lines: { text: string; y: number }[];
}

/**
 * The four credit cards in `MAIN.C` order (`tptr` 0..3, lines 103-128). Case 4 (`MAIN.C:129-131`) only runs
 * `ffonapois()` (a fade housekeeping pass with no new text), so it carries no lines. The y's are the
 * original `addtext`/`faddtext` screen-y arguments.
 */
export const CREDIT_CARDS: CreditCard[] = [
  {
    lines: [
      { text: 'Graphics', y: 50 },
      { text: 'Marvel', y: 90 },
      { text: 'Pixel', y: 130 },
    ],
  },
  {
    lines: [
      { text: 'Music', y: 50 },
      { text: 'Purple Motion', y: 90 },
      { text: 'Skaven', y: 130 },
    ],
  },
  {
    lines: [
      { text: 'Code', y: 30 },
      { text: 'Psi', y: 70 },
      { text: 'Trug', y: 110 },
      { text: 'Wildfire', y: 148 },
    ],
  },
  {
    lines: [
      { text: 'Additional Design', y: 50 },
      { text: 'Abyss', y: 90 },
      { text: 'Gore', y: 130 },
    ],
  },
];

/** Scroll pixels each card occupies before the next enters (the `a<320` march split across the cards). */
export const PER_CARD_SCROLL = Math.trunc(SCROLL_SPAN / CREDIT_CARDS.length);

/** Total sim-frames for one full scroll pass (used for the lab self-loop). */
export const TIMELINE_FRAMES = SCROLL_SPAN * SCRLF;

export interface ScrollState {
  /** Pixel scroll offset `a` (0 .. SCROLL_SPAN-1). */
  scroll: number;
  /** Index of the credit card currently scrolling through (0 .. CREDIT_CARDS.length-1). */
  card: number;
}

/**
 * Resolve the scroll offset and active card at sim-frame `frame`, looping over the timeline. One scroll
 * pixel advances every `SCRLF` sim-frames (`do_scroll`'s `frame_count >= SCRLF` gate). The active card is
 * the scroll position divided into `CREDIT_CARDS.length` equal stretches, matching the original's sequential
 * `tptr` advance across the `a<320` march.
 */
export function scrollAt(frame: number): ScrollState {
  const f = ((frame % TIMELINE_FRAMES) + TIMELINE_FRAMES) % TIMELINE_FRAMES;
  const scroll = Math.trunc(f / SCRLF);
  let card = Math.trunc(scroll / PER_CARD_SCROLL);
  if (card >= CREDIT_CARDS.length) card = CREDIT_CARDS.length - 1;
  return { scroll, card };
}

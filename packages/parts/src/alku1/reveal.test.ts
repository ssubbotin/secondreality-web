import { describe, expect, it } from 'vitest';
import { CARDS, FADE_STEPS, HOLD_FRAMES, revealAt, TIMELINE_FRAMES } from './reveal.js';

describe('opening reveal timeline', () => {
  it('declares the three opening cards from MAIN.C:61-76', () => {
    expect(CARDS.map((c) => c.lines)).toEqual([
      ['A', 'Future Crew', 'Production'],
      ['First Presented', 'at Assembly 93'],
      ['in', 'ä', 'ö'],
    ]);
  });

  it('fades a card in over FADE_STEPS, holds, then out', () => {
    const card0Start = 0;
    // Start of fade-in: level 0.
    expect(revealAt(card0Start)).toEqual({ card: 0, level: 0 });
    // Mid fade-in.
    expect(revealAt(card0Start + 32)).toEqual({ card: 0, level: 32 });
    // End of fade-in.
    expect(revealAt(card0Start + FADE_STEPS)).toEqual({ card: 0, level: 64 });
    // During the hold: fully lit.
    expect(revealAt(card0Start + FADE_STEPS + 10)).toEqual({ card: 0, level: 64 });
    // Fade-out begins after the hold.
    const outStart = card0Start + FADE_STEPS + HOLD_FRAMES;
    expect(revealAt(outStart + 0)).toEqual({ card: 0, level: 64 });
    // One frame before the span end the card is nearly black; the final frame rolls to the next card.
    expect(revealAt(outStart + FADE_STEPS - 1)).toEqual({ card: 0, level: 1 });
  });

  it('advances to the next card after the previous fully fades out', () => {
    const cardSpan = FADE_STEPS + HOLD_FRAMES + FADE_STEPS;
    expect(revealAt(cardSpan).card).toBe(1);
    expect(revealAt(cardSpan + 32)).toEqual({ card: 1, level: 32 });
    expect(revealAt(2 * cardSpan).card).toBe(2);
  });

  it('loops the timeline (self-loop in the lab)', () => {
    expect(revealAt(0)).toEqual(revealAt(TIMELINE_FRAMES));
    expect(revealAt(50)).toEqual(revealAt(TIMELINE_FRAMES + 50));
  });

  it('never reports a level outside 0..64', () => {
    for (let f = 0; f < TIMELINE_FRAMES + 200; f += 7) {
      const r = revealAt(f);
      expect(r.level).toBeGreaterThanOrEqual(0);
      expect(r.level).toBeLessThanOrEqual(64);
    }
  });
});

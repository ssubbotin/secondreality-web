import { describe, expect, it } from 'vitest';
import {
  CREDIT_CARDS,
  PER_CARD_SCROLL,
  SCRLF,
  SCROLL_SPAN,
  scrollAt,
  TIMELINE_FRAMES,
} from './scroll.js';

describe('credit cards (MAIN.C:103-128)', () => {
  it('carries the four FC credit cards in order, verbatim', () => {
    expect(CREDIT_CARDS.map((c) => c.lines.map((l) => l.text))).toEqual([
      ['Graphics', 'Marvel', 'Pixel'],
      ['Music', 'Purple Motion', 'Skaven'],
      ['Code', 'Psi', 'Trug', 'Wildfire'],
      ['Additional Design', 'Abyss', 'Gore'],
    ]);
  });

  it('keeps the original per-line screen-y arguments', () => {
    expect(CREDIT_CARDS[2]?.lines.map((l) => l.y)).toEqual([30, 70, 110, 148]);
  });
});

describe('scrollAt (MAIN.C do_scroll cadence)', () => {
  it('advances one scroll pixel every SCRLF sim-frames', () => {
    expect(SCRLF).toBe(9);
    expect(scrollAt(0).scroll).toBe(0);
    expect(scrollAt(SCRLF - 1).scroll).toBe(0);
    expect(scrollAt(SCRLF).scroll).toBe(1);
    expect(scrollAt(SCRLF * 5).scroll).toBe(5);
  });

  it('walks the scroll across the full SCROLL_SPAN', () => {
    expect(scrollAt((SCROLL_SPAN - 1) * SCRLF).scroll).toBe(SCROLL_SPAN - 1);
  });

  it('sequences the credit cards across the scroll march', () => {
    expect(scrollAt(0).card).toBe(0);
    expect(scrollAt(PER_CARD_SCROLL * SCRLF).card).toBe(1);
    expect(scrollAt(2 * PER_CARD_SCROLL * SCRLF).card).toBe(2);
    expect(scrollAt(3 * PER_CARD_SCROLL * SCRLF).card).toBe(3);
  });

  it('clamps the card index to the last card at the end of the march', () => {
    const s = scrollAt((SCROLL_SPAN - 1) * SCRLF);
    expect(s.card).toBeLessThan(CREDIT_CARDS.length);
    expect(s.card).toBe(CREDIT_CARDS.length - 1);
  });

  it('loops over the timeline', () => {
    expect(scrollAt(TIMELINE_FRAMES)).toEqual(scrollAt(0));
    expect(scrollAt(TIMELINE_FRAMES + SCRLF)).toEqual(scrollAt(SCRLF));
  });

  it('handles negative frames (loop wrap) without NaN', () => {
    const s = scrollAt(-1);
    expect(Number.isInteger(s.scroll)).toBe(true);
    expect(s.scroll).toBeGreaterThanOrEqual(0);
    expect(s.scroll).toBeLessThan(SCROLL_SPAN);
  });
});

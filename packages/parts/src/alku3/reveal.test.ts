import { describe, expect, it } from 'vitest';
import { FADE_STEPS, HOLD_FRAMES, revealAt, TIMELINE_FRAMES } from './reveal.js';

describe('title-card reveal timeline (MAIN.C:71-77)', () => {
  it('fades the title in over FADE_STEPS, holds, then out', () => {
    expect(revealAt(0)).toEqual({ level: 0 });
    expect(revealAt(32)).toEqual({ level: 32 });
    expect(revealAt(FADE_STEPS)).toEqual({ level: 64 });
    // During the hold: fully lit.
    expect(revealAt(FADE_STEPS + 10)).toEqual({ level: 64 });
    // Fade-out begins after the hold.
    const outStart = FADE_STEPS + HOLD_FRAMES;
    expect(revealAt(outStart)).toEqual({ level: 64 });
    expect(revealAt(outStart + FADE_STEPS - 1)).toEqual({ level: 1 });
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

import { describe, expect, it } from 'vitest';
import type { ClockSample } from '../audio/clock.js';
import { MusicSync } from './music-sync.js';

const base: ClockSample = { songSeconds: 10, order: 1, row: 13, pattern: 9, bpm: 125 };

describe('MusicSync', () => {
  it('resolves a base ClockSample into the full four-channel MusicClock', () => {
    const sync = new MusicSync();
    const c = sync.resolve(base);
    expect(c.muscode).toBe(0); // no Zxx in the shipped modules
    expect(c.musplus).toBe(13); // row 13, bracketed section (zplus 3) -> +13
    expect(c.musrow).toBe(13);
    expect(c.songSeconds).toBe(10);
    expect(c.order).toBe(1);
    expect(c.pattern).toBe(9);
    expect(c.bpm).toBe(125);
  });

  it('mframe is a tempo-driven tick count, resettable via setMframe', () => {
    const sync = new MusicSync();
    // 10s @ 125 BPM = 500 ticks; with no reset, mframe reads the absolute tick count.
    expect(sync.resolve(base).mframe).toBe(500);
    sync.setMframe(0); // reset "now" (still at 500 ticks)
    expect(sync.resolve(base).mframe).toBe(0);
    // +1s @ 125 BPM = +50 ticks.
    expect(sync.resolve({ ...base, songSeconds: 11 }).mframe).toBe(50);
  });
});

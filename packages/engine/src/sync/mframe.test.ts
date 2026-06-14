import { describe, expect, it } from 'vitest';
import { MframeTrack, songTicksAt } from './mframe.js';

describe('songTicksAt — ScreamTracker-3 tick rate (BPM * 2/5)', () => {
  it('is 50 ticks/sec at 125 BPM', () => {
    expect(songTicksAt(1, 125)).toBe(50);
    expect(songTicksAt(6, 125)).toBe(300); // GLENZ waits getmframe() < 300 -> ~6s at 125 BPM
  });

  it('scales with tempo', () => {
    expect(songTicksAt(1, 130)).toBe(52);
    expect(songTicksAt(2, 120)).toBe(96);
  });
});

describe('MframeTrack — part-resettable song-tick counter', () => {
  it('is 0 right after a reset and counts up in ticks', () => {
    const t = new MframeTrack();
    t.set(300, 0); // dis_setmframe(0) at tick 300
    expect(t.get(300)).toBe(0);
    expect(t.get(350)).toBe(50); // +50 ticks
  });

  it('reproduces a GLENZ-style getmframe() < 300 hold', () => {
    const t = new MframeTrack();
    t.set(1000, 0);
    expect(t.get(1299)).toBe(299); // still < 300 -> GLENZ holds
    expect(t.get(1300)).toBe(300); // not < 300 -> proceeds
  });

  it('set(value) seeds an arbitrary starting count', () => {
    const t = new MframeTrack();
    t.set(500, 42);
    expect(t.get(500)).toBe(42);
    expect(t.get(510)).toBe(52);
  });
});

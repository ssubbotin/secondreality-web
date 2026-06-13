import { describe, expect, it } from 'vitest';
import { type Anchor, AudioClock, songSecondsAt } from './clock.js';

const anchor: Anchor = { songSeconds: 10, contextTime: 100 };

describe('songSecondsAt', () => {
  it('extrapolates forward in real time from the anchor', () => {
    // 0.25s of real time after the anchor, no latency/offset.
    expect(songSecondsAt(anchor, 100.25, 0, 0)).toBeCloseTo(10.25, 6);
  });

  it('subtracts output latency (we hear audio later than it is scheduled)', () => {
    expect(songSecondsAt(anchor, 100.0, 0.02, 0)).toBeCloseTo(9.98, 6);
  });

  it('applies the user A/V offset additively', () => {
    expect(songSecondsAt(anchor, 100.0, 0.0, 0.05)).toBeCloseTo(10.05, 6);
  });
});

describe('AudioClock', () => {
  it('returns 0 before the first report', () => {
    const c = new AudioClock();
    expect(c.sampleAt(123).songSeconds).toBe(0);
  });

  it('re-anchors on each report and reports order/row/pattern', () => {
    const c = new AudioClock();
    c.update({ songSeconds: 5, contextTime: 50, order: 2, row: 8, pattern: 3, bpm: 130 });
    const s = c.sampleAt(50.1);
    expect(s.songSeconds).toBeCloseTo(5.1, 6);
    expect(s.order).toBe(2);
    expect(s.row).toBe(8);
    expect(s.pattern).toBe(3);
    expect(s.bpm).toBe(130);
  });

  it('never moves backward within a single anchor (monotonic guard)', () => {
    const c = new AudioClock();
    c.update({ songSeconds: 5, contextTime: 50, order: 0, row: 0, pattern: 0, bpm: 125 });
    const a = c.sampleAt(50.2).songSeconds;
    const b = c.sampleAt(50.1).songSeconds; // a query slightly in the past
    expect(b).toBeGreaterThanOrEqual(a - 1e-9);
  });

  it('clamps to the anchor value when now is before the anchor contextTime', () => {
    // Pipeline ordering can hand sampleAt a `now` slightly before the report's contextTime;
    // the monotonic guard must hold at the anchor value rather than going negative.
    const c = new AudioClock();
    c.update({ songSeconds: 5, contextTime: 50, order: 0, row: 0, pattern: 0, bpm: 125 });
    expect(c.sampleAt(49.9).songSeconds).toBeCloseTo(5, 6);
  });

  it('allows a backward jump when a fresh report re-anchors (song looped)', () => {
    const c = new AudioClock();
    c.update({ songSeconds: 180, contextTime: 50, order: 40, row: 0, pattern: 9, bpm: 125 });
    c.sampleAt(50.0);
    c.update({ songSeconds: 0, contextTime: 51, order: 0, row: 0, pattern: 0, bpm: 125 }); // loop wrap
    expect(c.sampleAt(51.0).songSeconds).toBeCloseTo(0, 6);
  });
});

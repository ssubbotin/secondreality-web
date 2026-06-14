import { describe, expect, it } from 'vitest';
import { MFRAME_HZ, MframeTrack } from './mframe.js';

describe('MframeTrack', () => {
  it('is 0 right after a reset and counts up at MFRAME_HZ', () => {
    const t = new MframeTrack();
    t.set(10.0, 0);
    expect(t.get(10.0)).toBe(0);
    expect(t.get(11.0)).toBe(MFRAME_HZ);
  });

  it('reproduces a GLENZ-style hold (getmframe()<300 after setmframe(0))', () => {
    const t = new MframeTrack();
    t.set(40.0, 0);
    expect(t.get(40.0 + 299 / MFRAME_HZ)).toBe(299); // still < 300 -> GLENZ holds
    expect(t.get(40.0 + 300 / MFRAME_HZ)).toBe(300); // not < 300 -> proceeds
  });

  it('set(s, n) makes get(s) return n', () => {
    const t = new MframeTrack();
    t.set(5.0, 120);
    expect(t.get(5.0)).toBe(120);
  });
});

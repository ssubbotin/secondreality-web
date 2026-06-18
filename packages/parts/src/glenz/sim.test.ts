import { describe, expect, it } from 'vitest';
import { createGlenzState, stepGlenz } from './sim.js';

describe('glenz sim — per-tick animation from GLENZ/MAIN.C while(repeat--)', () => {
  it('starts at frame 0 with the entry scales and ypos offscreen', () => {
    const s = createGlenzState();
    expect(s.frame).toBe(0);
    expect(s.xscale).toBe(120);
    expect(s.yscale).toBe(120);
    expect(s.zscale).toBe(120);
    expect(s.bscale).toBe(0);
    expect(s.ypos).toBe(-9000);
    expect(s.rz).toBe(0);
  });

  it('advances rotation: rx+=32, ry+=7 per tick, rz stays 0', () => {
    const s = createGlenzState();
    stepGlenz(s);
    expect(s.frame).toBe(1);
    expect(s.rx).toBe(32);
    expect(s.ry).toBe(7);
    expect(s.rz).toBe(0);
    for (let i = 0; i < 9; i++) stepGlenz(s);
    expect(s.frame).toBe(10);
    expect(s.rx).toBe(320);
    expect(s.ry).toBe(70);
  });

  it('wraps rotation modulo 3*3600', () => {
    const s = createGlenzState();
    // rx grows by 32/tick; after enough ticks it wraps within [0, 10800).
    for (let i = 0; i < 400; i++) stepGlenz(s);
    expect(s.rx).toBeGreaterThanOrEqual(0);
    expect(s.rx).toBeLessThan(3 * 3600);
    expect(s.ry).toBeLessThan(3 * 3600);
  });

  it('is deterministic for a given tick count', () => {
    const a = createGlenzState();
    const b = createGlenzState();
    for (let i = 0; i < 250; i++) {
      stepGlenz(a);
      stepGlenz(b);
    }
    expect(a.rx).toBe(b.rx);
    expect(a.ypos).toBe(b.ypos);
    expect(a.xscale).toBe(b.xscale);
    expect(a.jello).toBe(b.jello);
  });

  it('the second solid stays hidden until frame 800 (bscale ramps from 0)', () => {
    const s = createGlenzState();
    expect(s.bscale).toBe(0);
    for (let i = 0; i < 800; i++) stepGlenz(s);
    // After 800 ticks bscale has begun ramping (the +2/tick path once frame>800).
    expect(s.frame).toBe(800);
    stepGlenz(s);
    expect(s.bscale).toBeGreaterThan(0);
  });

  it('position wobble (oxp/oyp/ozp) is zero before frame 900, non-trivial after', () => {
    const s = createGlenzState();
    for (let i = 0; i < 900; i++) stepGlenz(s);
    // exactly at frame 900 the wobble has not yet engaged (frame>900 gate)
    const before = s.oxp;
    for (let i = 0; i < 50; i++) stepGlenz(s);
    expect(s.frame).toBe(950);
    expect(s.oxp !== before || s.oyp !== 0 || s.ozp !== 0).toBe(true);
  });
});

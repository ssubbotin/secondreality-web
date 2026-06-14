import { describe, expect, it } from 'vitest';
import { barQuads } from './geometry.js';

describe('barQuads — faithful port of KOE.C doit* bar geometry', () => {
  it('returns 11 bars', () => {
    expect(barQuads(0, 100).length).toBe(11);
  });

  it('matches the KOE.C corner formula for the centre bar at rot=0, vm=100', () => {
    const q = barQuads(0, 100)[5]; // c = 0 is the 6th bar (c = -10,-8,...,0,...,10)
    expect(q).toEqual({
      x1: 141,
      y1: -156,
      x2: 179,
      y2: -156,
      x3: 179,
      y3: 356,
      x4: 141,
      y4: 356,
    });
  });

  it('offsets outer bars along the short axis (vy=0 keeps them on one row at rot=0)', () => {
    const bars = barQuads(0, 100);
    // vx=307 so cx = 307*c*2; bar c=-10 sits left of bar c=0 by (307*-20)/16 = -383 px.
    expect(bars[0].x1).toBe(barQuads(0, 100)[5].x1 + Math.trunc((307 * -20) / 16));
  });
});

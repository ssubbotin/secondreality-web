import { describe, expect, it } from 'vitest';
import { buildBallPalette } from './palette.js';

describe('minivectorballs palette — MAIN.C constructed VGA ramp', () => {
  const p = buildBallPalette();
  const rgb = (i: number): [number, number, number] => [
    p[i * 3] ?? 0,
    p[i * 3 + 1] ?? 0,
    p[i * 3 + 2] ?? 0,
  ];

  it('is 256 RGB triples, all within the 6-bit VGA range [0,63]', () => {
    expect(p).toHaveLength(256 * 3);
    for (const v of p) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of p) expect(v).toBeLessThanOrEqual(63);
  });

  it('ball ramp index a*4+b = (cols[b].R, cols[b].G*c/256, cols[b].B*c/256), c=100+a*9', () => {
    // cols = {0,0,0, 4,25,30, 8,40,45, 16,55,60}; b is the channel, a is the brightness step.
    // index 0 (a=0,b=0): channel 0 is all-zero → black.
    expect(rgb(0)).toEqual([0, 0, 0]);
    // index 2 (a=0,b=2): c=100; R=8, G=40*100/256=15, B=45*100/256=17.
    expect(rgb(2)).toEqual([8, 15, 17]);
    // index 3 (a=0,b=3): c=100; R=16, G=55*100/256=21, B=60*100/256=23.
    expect(rgb(3)).toEqual([16, 21, 23]);
    // index 63 (a=15,b=3): c=100+135=235; R=16, G=55*235/256=50, B=60*235/256=55.
    expect(rgb(63)).toEqual([16, 50, 55]);
    // index 6 (a=1,b=2): c=109; R=8, G=40*109/256=17, B=45*109/256=19.
    expect(rgb(6)).toEqual([8, 17, 19]);
  });

  it('floor/shadow ramp 64..163 is grey (c/4), c=((64-256/(a+4))^2)/64; index 87 is the shadow dot', () => {
    // a=0: c=(64-256/4)^2/64=(64-64)^2/64=0 → grey 0.
    expect(rgb(64)).toEqual([0, 0, 0]);
    // a=23 (index 87, the plotted shadow): 256/27=9, 64-9=55, 55*55/64=47, 47/4=11.
    expect(rgb(87)).toEqual([11, 11, 11]);
    // a=99 (index 163, brightest floor): 256/103=2, 62, 62*62/64=60, 60/4=15.
    expect(rgb(163)).toEqual([15, 15, 15]);
  });

  it('keeps the debug index 255 = (31,0,15) faithfully (never drawn by the effect)', () => {
    expect(rgb(255)).toEqual([31, 0, 15]);
  });
});

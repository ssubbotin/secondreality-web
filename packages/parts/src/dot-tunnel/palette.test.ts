import { describe, expect, it } from 'vitest';
import { buildTunnelPalette } from './palette.js';

describe('dot tunnel palette', () => {
  const p = buildTunnelPalette();
  const rgb = (i: number): [number, number, number] => [
    p[i * 3] ?? 0,
    p[i * 3 + 1] ?? 0,
    p[i * 3 + 2] ?? 0,
  ];

  it('is 256 RGB triples', () => {
    expect(p).toHaveLength(256 * 3);
  });

  it('ramp A (64+x) is a grey 64−x ramp, clamped to 63 at the x=0 endpoint', () => {
    expect(rgb(64)).toEqual([63, 63, 63]); // 64−0 = 64 → clamped to 63
    expect(rgb(65)).toEqual([63, 63, 63]); // 64−1 = 63
    expect(rgb(96)).toEqual([32, 32, 32]); // 64−32
    expect(rgb(127)).toEqual([1, 1, 1]); // 64−63
  });

  it('ramp B (128+x) is a dimmer grey ((64−x)·3 div 4) ramp', () => {
    expect(rgb(128)).toEqual([48, 48, 48]); // (64−0)*3 div 4 = 48 (ramp B overwrites ramp A here)
    expect(rgb(160)).toEqual([24, 24, 24]); // (64−32)*3 div 4 = 24
  });

  it('forces indices 68 and 132 and the background 0 to black', () => {
    expect(rgb(0)).toEqual([0, 0, 0]);
    expect(rgb(68)).toEqual([0, 0, 0]);
    expect(rgb(132)).toEqual([0, 0, 0]);
  });
});

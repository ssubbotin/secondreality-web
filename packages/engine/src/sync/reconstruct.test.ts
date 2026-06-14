import { describe, expect, it } from 'vitest';
import { computeMusplus, reconstructSync } from './reconstruct.js';

describe('computeMusplus — the clamped signed DX from DIS muscode_6', () => {
  it('zplus 0: parked at -32 (no +++ marker in play)', () => {
    expect(computeMusplus(0, 0)).toBe(-32);
    expect(computeMusplus(0, 31)).toBe(-32);
    expect(computeMusplus(0, 63)).toBe(-32);
  });

  it('zplus 1: counts down to the +++ ahead, clamped at -32', () => {
    expect(computeMusplus(1, 0)).toBe(-32); // row-64=-64 -> clamp
    expect(computeMusplus(1, 32)).toBe(-32);
    expect(computeMusplus(1, 45)).toBe(-19); // 45-64
    expect(computeMusplus(1, 63)).toBe(-1);
  });

  it('zplus 2: counts up from the +++ behind, then parks at -32 in the second half', () => {
    expect(computeMusplus(2, 0)).toBe(0);
    expect(computeMusplus(2, 31)).toBe(31);
    expect(computeMusplus(2, 32)).toBe(-32);
    expect(computeMusplus(2, 63)).toBe(-32);
  });

  it('zplus 3 (bracketed section): symmetric, reducing to row<32?row:row-64', () => {
    expect(computeMusplus(3, 0)).toBe(0);
    expect(computeMusplus(3, 13)).toBe(13); // PLZPART waits while musplus<13 -> proceeds at row 13
    expect(computeMusplus(3, 31)).toBe(31);
    expect(computeMusplus(3, 32)).toBe(-32);
    expect(computeMusplus(3, 45)).toBe(-19); // GLENZ <-19 proceeds here
    expect(computeMusplus(3, 60)).toBe(-4); // TECHNO <-4 proceeds
    expect(computeMusplus(3, 63)).toBe(-1);
  });

  it('reproduces the GLENZ (-16,0) window break (a<0 && a>-16) over the bar tail', () => {
    const inWindow = (row: number) => {
      const a = computeMusplus(3, row);
      return a < 0 && a > -16;
    };
    expect(inWindow(48)).toBe(false); // -16
    expect(inWindow(49)).toBe(true); // -15
    expect(inWindow(63)).toBe(true); // -1
    expect(inWindow(0)).toBe(false); // 0
  });
});

describe('reconstructSync — muscode/musplus/musrow from the live row', () => {
  it('muscode is 0 (the shipped modules carry no Zxx)', () => {
    expect(reconstructSync(0).muscode).toBe(0);
    expect(reconstructSync(13).muscode).toBe(0);
    expect(reconstructSync(60).muscode).toBe(0);
  });

  it('returns the raw row as musrow and the bracketed-section (zplus 3) musplus by default', () => {
    const s = reconstructSync(13);
    expect(s.musrow).toBe(13);
    expect(s.musplus).toBe(13);
    const t = reconstructSync(60);
    expect(t.musrow).toBe(60);
    expect(t.musplus).toBe(-4);
  });

  it('honours an explicit zplus phase', () => {
    expect(reconstructSync(45, 0).musplus).toBe(-32);
    expect(reconstructSync(45, 1).musplus).toBe(-19);
  });
});

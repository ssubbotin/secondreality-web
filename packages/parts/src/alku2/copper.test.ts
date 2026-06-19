import { describe, expect, it } from 'vitest';
import { backdropOffset, HOI_W, SCREEN_W, sampleBackdropRow } from './copper.js';

describe('backdropOffset (HOI horizontal pan)', () => {
  it('pans one source pixel per scroll step', () => {
    expect(backdropOffset(0)).toBe(0);
    expect(backdropOffset(1)).toBe(1);
    expect(backdropOffset(319)).toBe(319);
  });

  it('wraps over the 640-px source width', () => {
    expect(backdropOffset(HOI_W)).toBe(0);
    expect(backdropOffset(HOI_W + 5)).toBe(5);
  });

  it('handles negative offsets', () => {
    expect(backdropOffset(-1)).toBe(HOI_W - 1);
  });
});

describe('sampleBackdropRow', () => {
  const makeHoi = (): Uint8Array => {
    const hoi = new Uint8Array(HOI_W * 2);
    // Row 0: a ramp = pixel index modulo 256; row 1: constant 7.
    for (let x = 0; x < HOI_W; x++) hoi[x] = x & 0xff;
    for (let x = 0; x < HOI_W; x++) hoi[HOI_W + x] = 7;
    return hoi;
  };

  it('copies a 320-px window from the source at the given offset', () => {
    const hoi = makeHoi();
    const row = new Uint8Array(SCREEN_W);
    sampleBackdropRow(row, hoi, 0, 0);
    for (let x = 0; x < SCREEN_W; x++) expect(row[x]).toBe(x & 0xff);
  });

  it('shifts the window left as the offset advances', () => {
    const hoi = makeHoi();
    const a = new Uint8Array(SCREEN_W);
    const b = new Uint8Array(SCREEN_W);
    sampleBackdropRow(a, hoi, 0, 10);
    sampleBackdropRow(b, hoi, 0, 11);
    // b is a one-pixel left shift of a (same source, offset +1).
    for (let x = 0; x < SCREEN_W - 1; x++) expect(b[x]).toBe(a[x + 1]);
  });

  it('wraps the window across the source seam', () => {
    const hoi = makeHoi();
    const row = new Uint8Array(SCREEN_W);
    sampleBackdropRow(row, hoi, 0, HOI_W - 5);
    // First 5 pixels are the tail of the row, then it wraps to the head.
    expect(row[0]).toBe((HOI_W - 5) & 0xff);
    expect(row[5]).toBe(0);
  });

  it('reads the requested source row', () => {
    const hoi = makeHoi();
    const row = new Uint8Array(SCREEN_W);
    sampleBackdropRow(row, hoi, 1, 0);
    for (let x = 0; x < SCREEN_W; x++) expect(row[x]).toBe(7);
  });
});

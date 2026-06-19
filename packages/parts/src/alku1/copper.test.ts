import { describe, expect, it } from 'vitest';
import {
  backdropOffset,
  composeBackdrop,
  HOI_W,
  SCREEN_H,
  SCREEN_W,
  sampleBackdropRow,
} from './copper.js';

/** A tiny synthetic 640×200 HOI source where each pixel encodes its source column (mod 256). */
function fakeHoi(): Uint8Array {
  const hoi = new Uint8Array(HOI_W * SCREEN_H);
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < HOI_W; x++) hoi[y * HOI_W + x] = x & 0xff;
  }
  return hoi;
}

describe('HOI backdrop window', () => {
  it('wraps the copper pan offset over the 640-wide source', () => {
    expect(backdropOffset(0)).toBe(0);
    expect(backdropOffset(HOI_W)).toBe(0);
    expect(backdropOffset(-1)).toBe(HOI_W - 1);
    expect(backdropOffset(HOI_W + 5)).toBe(5);
  });

  it('samples a 320-pixel window from the source row, wrapping at the source edge', () => {
    const hoi = fakeHoi();
    const row = new Uint8Array(SCREEN_W);
    sampleBackdropRow(row, hoi, 10, 100);
    for (let x = 0; x < SCREEN_W; x++) {
      expect(row[x]).toBe((100 + x) & 0xff);
    }
  });

  it('fills every scanline of the field with the windowed HOI source', () => {
    const hoi = fakeHoi();
    const dst = new Uint8Array(SCREEN_W * SCREEN_H);
    composeBackdrop(dst, hoi, 0);
    for (let y = 0; y < SCREEN_H; y++) {
      for (let x = 0; x < SCREEN_W; x++) {
        expect(dst[y * SCREEN_W + x]).toBe(x & 0xff);
      }
    }
  });

  it('pans horizontally with the offset', () => {
    const hoi = fakeHoi();
    const a = new Uint8Array(SCREEN_W * SCREEN_H);
    const b = new Uint8Array(SCREEN_W * SCREEN_H);
    composeBackdrop(a, hoi, 0);
    composeBackdrop(b, hoi, 4);
    expect([...b.subarray(0, SCREEN_W)]).not.toEqual([...a.subarray(0, SCREEN_W)]);
  });
});

import { describe, expect, it } from 'vitest';
import { composeBackdrop, composeFrame, composeText, TEXT_BAND_Y, textOriginX } from './compose.js';
import { HOI_W, SCREEN_H, SCREEN_W } from './copper.js';
import { makeTextBuffer, TBUF_H, TBUF_W } from './text-buffer.js';

const screen = (): Uint8Array => new Uint8Array(SCREEN_W * SCREEN_H);

const ramp640 = (): Uint8Array => {
  const hoi = new Uint8Array(HOI_W * SCREEN_H);
  for (let y = 0; y < SCREEN_H; y++) for (let x = 0; x < HOI_W; x++) hoi[y * HOI_W + x] = x & 0x3f;
  return hoi;
};

describe('textOriginX', () => {
  it('starts the buffer off-screen right and slides it left', () => {
    expect(textOriginX(0)).toBe(SCREEN_W);
    expect(textOriginX(1)).toBe(SCREEN_W - 1);
    expect(textOriginX(SCREEN_W)).toBe(0);
  });
});

describe('TEXT_BAND_Y', () => {
  it('centres the text band vertically in the field', () => {
    expect(TEXT_BAND_Y).toBe(Math.trunc((SCREEN_H - TBUF_H) / 2));
    expect(TEXT_BAND_Y).toBeGreaterThanOrEqual(0);
  });
});

describe('composeBackdrop', () => {
  it('fills every scanline with the windowed HOI source', () => {
    const dst = screen();
    const hoi = ramp640();
    composeBackdrop(dst, hoi, 0);
    for (let y = 0; y < SCREEN_H; y++) {
      for (let x = 0; x < SCREEN_W; x++) expect(dst[y * SCREEN_W + x]).toBe(x & 0x3f);
    }
  });

  it('shifts the backdrop left as the offset advances', () => {
    const a = screen();
    const b = screen();
    const hoi = ramp640();
    composeBackdrop(a, hoi, 5);
    composeBackdrop(b, hoi, 6);
    for (let x = 0; x < SCREEN_W - 1; x++) {
      expect(b[100 * SCREEN_W + x]).toBe(a[100 * SCREEN_W + x + 1]);
    }
  });
});

describe('composeText', () => {
  it('ORs the text plane bytes over the backdrop', () => {
    const dst = screen();
    dst.fill(5); // a non-zero backdrop
    const tbuf = makeTextBuffer();
    // Put a lit pixel at tbuf (10,20).
    tbuf[20 * TBUF_W + 10] = 0x80;
    composeText(dst, tbuf, 0); // originX = SCREEN_W, so col 10 is off-screen right
    // At scroll 0 the buffer is off-screen right; nothing lands.
    for (const v of dst) expect(v).toBe(5);

    // Scroll so tbuf col 10 maps on-screen: originX = SCREEN_W - scroll; want originX+10 in [0,320).
    const scroll = SCREEN_W; // originX = 0 → col 10 at screen x 10
    composeText(dst, tbuf, scroll);
    const sy = TEXT_BAND_Y + 20;
    expect(dst[sy * SCREEN_W + 10]).toBe(5 | 0x80);
  });

  it('translates the text horizontally with the scroll', () => {
    const tbuf = makeTextBuffer();
    tbuf[30 * TBUF_W + 0] = 0x40; // a single lit column at tbuf x=0
    const a = screen();
    const b = screen();
    composeText(a, tbuf, SCREEN_W + 50); // originX = -50 → col0 off left; pick a col that lands
    // Use a scroll that lands col 0 at screen x = 100.
    composeText(b, tbuf, SCREEN_W - 100); // originX = 100 → col0 at x=100
    const sy = TEXT_BAND_Y + 30;
    expect(b[sy * SCREEN_W + 100]).toBe(0x40);
    // One step further left moves the lit column one pixel left.
    const c = screen();
    composeText(c, tbuf, SCREEN_W - 99); // originX = 99
    expect(c[sy * SCREEN_W + 99]).toBe(0x40);
  });

  it('clips text outside the field without throwing', () => {
    const dst = screen();
    const tbuf = makeTextBuffer();
    tbuf[(TBUF_H - 1) * TBUF_W + (TBUF_W - 1)] = 0xc0;
    expect(() => composeText(dst, tbuf, 0)).not.toThrow();
    expect(() => composeText(dst, tbuf, 10_000)).not.toThrow();
  });
});

describe('composeFrame', () => {
  it('lays the backdrop then ORs the text band on top', () => {
    const dst = screen();
    const hoi = ramp640();
    const tbuf = makeTextBuffer();
    tbuf[40 * TBUF_W + 5] = 0xc0;
    composeFrame(dst, hoi, tbuf, 0, SCREEN_W); // backdrop at 0, originX = 0 → tbuf col 5 at x=5
    const sy = TEXT_BAND_Y + 40;
    // Backdrop value at (5, sy) is 5 & 0x3f = 5; text ORs 0xc0.
    expect(dst[sy * SCREEN_W + 5]).toBe(5 | 0xc0);
    // A pixel with no text is just the backdrop.
    expect(dst[10 * SCREEN_W + 200]).toBe(200 & 0x3f);
  });
});

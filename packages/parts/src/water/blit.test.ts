import { describe, expect, it } from 'vitest';
import { composeWaterFrame, waterBlit } from './blit.js';
import { FRAME_RECORDS, SCREEN_PIXELS, type WatFrame } from './wat-data.js';

/** Build a WatFrame with empty records except those given as `cell -> positions`. */
function frameWith(map: Record<number, number[]>): WatFrame {
  const records = new Array(FRAME_RECORDS);
  let totalPos = 0;
  for (let i = 0; i < FRAME_RECORDS; i++) {
    const pos = map[i];
    if (pos) {
      records[i] = { count: pos.length, pos: Uint16Array.from(pos) };
      totalPos += pos.length;
    } else {
      records[i] = { count: 0, pos: new Uint16Array(0) };
    }
  }
  return { records, totalPos };
}

describe('waterBlit (Putrouts1 port)', () => {
  it('writes the background pixel where the scroll cell is empty', () => {
    const out = new Uint8Array(SCREEN_PIXELS);
    const bg = new Uint8Array(SCREEN_PIXELS).fill(7);
    const fbuf = new Uint8Array(FRAME_RECORDS + 1); // cell 0 is 0 (empty)
    const frame = frameWith({ 0: [10, 20] });
    waterBlit(out, bg, frame, fbuf);
    expect(out[10]).toBe(7);
    expect(out[20]).toBe(7);
  });

  it('writes the font pixel (over the background) where the scroll cell is non-zero', () => {
    const out = new Uint8Array(SCREEN_PIXELS);
    const bg = new Uint8Array(SCREEN_PIXELS).fill(7);
    const fbuf = new Uint8Array(FRAME_RECORDS + 1);
    fbuf[5] = 42; // glyph pixel in cell 5
    const frame = frameWith({ 5: [100, 200, 300] });
    waterBlit(out, bg, frame, fbuf);
    expect(out[100]).toBe(42);
    expect(out[200]).toBe(42);
    expect(out[300]).toBe(42);
  });

  it('ignores out-of-range destination offsets defensively', () => {
    const out = new Uint8Array(SCREEN_PIXELS);
    const bg = new Uint8Array(SCREEN_PIXELS).fill(1);
    const fbuf = new Uint8Array(FRAME_RECORDS + 1);
    const frame = frameWith({ 0: [SCREEN_PIXELS + 100] });
    expect(() => waterBlit(out, bg, frame, fbuf)).not.toThrow();
  });

  it('composeWaterFrame fills untouched pixels with the background', () => {
    const out = new Uint8Array(SCREEN_PIXELS).fill(255);
    const bg = new Uint8Array(SCREEN_PIXELS);
    for (let i = 0; i < SCREEN_PIXELS; i++) bg[i] = i & 0xff;
    const fbuf = new Uint8Array(FRAME_RECORDS + 1);
    fbuf[0] = 99;
    const frame = frameWith({ 0: [12345] });
    composeWaterFrame(out, bg, frame, fbuf);
    expect(out[12345]).toBe(99); // touched by the glyph
    expect(out[0]).toBe(bg[0]); // untouched → background
    expect(out[64000 - 1]).toBe(bg[64000 - 1]);
  });
});

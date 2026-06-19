import { describe, expect, it } from 'vitest';
import { FBUF_LEN, FBUF_WIDTH, FONT_ROWS, FONT_WIDTH, SCP_END, Scroller } from './scroller.js';

/** Build a 400×34 font strip whose value encodes (row+1) so injected columns are identifiable. */
function makeFont(): Uint8Array {
  const font = new Uint8Array(FONT_WIDTH * FONT_ROWS);
  for (let x = 0; x < FONT_ROWS; x++) {
    for (let c = 0; c < FONT_WIDTH; c++) {
      // Non-zero, distinct per row, never 0 so the blit treats it as a glyph pixel.
      font[x * FONT_WIDTH + c] = (x + 1) & 0xff || 1;
    }
  }
  return font;
}

/** Injection cell offsets the scroll step writes to (158*(x+1) for x=0..33, in-bounds). */
function injectionCells(): number[] {
  const cells: number[] = [];
  for (let x = 0; x < FONT_ROWS; x++) {
    const dst = FBUF_WIDTH + x * FBUF_WIDTH;
    if (dst < FBUF_LEN) cells.push(dst);
  }
  return cells;
}

describe('Scroller', () => {
  it('starts empty at column 0 with the flat 158*34+1 buffer', () => {
    const s = new Scroller();
    expect(s.fbuf).toHaveLength(FBUF_LEN);
    expect(s.fbuf).toHaveLength(FBUF_WIDTH * 34 + 1);
    expect(s.column).toBe(0);
    expect(s.finished).toBe(false);
    expect(s.fbuf.every((v) => v === 0)).toBe(true);
  });

  it('scrollStep injects one font column at stride-158 cells and advances scp', () => {
    const s = new Scroller();
    const font = makeFont();
    s.scrollStep(font);
    expect(s.column).toBe(1); // scp incremented after the inject
    // Injection points are 158*(x+1) for x=0..33; cell value == font row value (x+1).
    for (let x = 0; x < FONT_ROWS; x++) {
      const dst = FBUF_WIDTH + x * FBUF_WIDTH;
      if (dst >= FBUF_LEN) continue;
      expect(s.fbuf[dst]).toBe((x + 1) & 0xff);
    }
  });

  it('shifts the whole buffer left by one byte each step (move(fbuf[1],fbuf,...))', () => {
    const s = new Scroller();
    const font = makeFont();
    s.scrollStep(font);
    const before = Uint8Array.from(s.fbuf);
    s.scrollStep(font);
    // After a second step, what was at index i moved to i-1 (except freshly-injected cells).
    const injected = new Set(injectionCells());
    for (let i = 1; i < FBUF_LEN; i++) {
      if (injected.has(i - 1)) continue; // freshly overwritten this step
      expect(s.fbuf[i - 1]).toBe(before[i]);
    }
  });

  it('reveals the whole message: scp reaches SCP_END (= the full font width)', () => {
    const s = new Scroller();
    const font = makeFont();
    for (let i = 0; i < SCP_END; i++) s.scrollStep(font);
    expect(s.column).toBe(SCP_END);
    expect(SCP_END).toBe(FONT_WIDTH); // the last glyph columns are no longer dropped
    expect(s.finished).toBe(true);
  });

  it('bounds scp at SCP_END — it never advances past the end of the message', () => {
    const s = new Scroller();
    const font = makeFont();
    for (let i = 0; i < SCP_END + 200; i++) s.scrollStep(font);
    expect(s.column).toBe(SCP_END);
  });

  it('emits NO new ink once past the end of the message (no frozen-column leak)', () => {
    const s = new Scroller();
    const font = makeFont();
    // Feed the entire message in so scp is exhausted.
    for (let i = 0; i < SCP_END; i++) s.scrollStep(font);
    expect(s.finished).toBe(true);
    // Every further step must inject 0 at every injection cell (the trailing region clears).
    const cells = injectionCells();
    for (let i = 0; i < 50; i++) {
      s.scrollStep(font);
      for (const dst of cells) expect(s.fbuf[dst]).toBe(0);
    }
  });

  it('drains the buffer to empty after the message ends (screen returns to background)', () => {
    const s = new Scroller();
    const font = makeFont();
    for (let i = 0; i < SCP_END; i++) s.scrollStep(font);
    // After enough blank steps to flush the whole 1-D buffer, no ink remains anywhere.
    for (let i = 0; i < FBUF_LEN + 10; i++) s.scrollStep(font);
    expect(s.fbuf.every((v) => v === 0)).toBe(true);
  });

  it('reset returns to an empty buffer at column 0', () => {
    const s = new Scroller();
    const font = makeFont();
    s.scrollStep(font);
    s.reset();
    expect(s.column).toBe(0);
    expect(s.finished).toBe(false);
    expect(s.fbuf.every((v) => v === 0)).toBe(true);
  });
});

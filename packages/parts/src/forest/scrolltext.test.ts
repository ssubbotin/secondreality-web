import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_H, FONT_W } from './pos.js';
import { parseScrolltext, Scroller, STRIP_H, STRIP_W } from './scrolltext.js';

const sci = (): Uint8Array =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL('./__fixtures__/OFOREST.SCI', import.meta.url))),
  );

describe('parseScrolltext (RIX3 OFOREST.SCI strip + 128 bias)', () => {
  it('reads a 640×31 strip', () => {
    const fbuf = parseScrolltext(sci());
    expect(fbuf.length).toBe(STRIP_W * STRIP_H);
    expect(STRIP_W).toBe(640);
    expect(STRIP_H).toBe(31);
  });

  it('biases non-zero text pixels by +128 and leaves background 0', () => {
    const fbuf = parseScrolltext(sci());
    // row 0 first text run begins at strip col 11 (READ2.PAS biased values)
    expect(fbuf[11]).toBe(130);
    expect(Array.from(fbuf.subarray(11, 19))).toEqual([130, 133, 134, 134, 134, 134, 134, 134]);
    // background before col 11 is 0
    expect(fbuf[10]).toBe(0);
    // every value is either 0 or in 129..255
    for (const v of fbuf) expect(v === 0 || v >= 129).toBe(true);
  });
});

describe('Scroller (READ2.PAS font window + scroll)', () => {
  it('initialises the font as fbuf cols 0..132 placed at font cols 104..236, scp=133', () => {
    const s = new Scroller(parseScrolltext(sci()));
    expect(s.cursor).toBe(133);
    expect(s.font.length).toBe(FONT_W * FONT_H);
    // row 5: fbuf[5][11] lands at font col 104+11 = 115
    expect(s.font[5 * FONT_W + 115]).toBe(132);
    // each row's rightmost column (col 236) is fbuf[row][132]
    expect(s.font[0 * FONT_W + 236]).toBe(134);
    // font cols < 104 are blank initially
    expect(s.font[5 * FONT_W + 103]).toBe(0);
  });

  it('shifts the window left one column and feeds a fresh rightmost column per step', () => {
    const s = new Scroller(parseScrolltext(sci()));
    for (let i = 0; i < 5; i++) s.step();
    expect(s.cursor).toBe(138);
    // the text at row5 col115 has moved left by 5 to col110
    expect(s.font[5 * FONT_W + 110]).toBe(132);
    expect(Array.from(s.font.subarray(5 * FONT_W + 108, 5 * FONT_W + 118))).toEqual([
      132, 132, 132, 131, 130, 130, 129, 0, 0, 0,
    ]);
    // rightmost column now reads fbuf[row][137]
    expect(s.font[5 * FONT_W + 236]).toBe(132);
  });

  it('stops advancing the cursor past 639 but keeps shifting', () => {
    const s = new Scroller(parseScrolltext(sci()));
    for (let i = 0; i < 700; i++) s.step();
    expect(s.cursor).toBe(639);
  });

  it('reset() restores the initial fill and cursor', () => {
    const s = new Scroller(parseScrolltext(sci()));
    for (let i = 0; i < 20; i++) s.step();
    s.reset();
    expect(s.cursor).toBe(133);
    expect(s.font[5 * FONT_W + 115]).toBe(132);
  });
});

import { describe, expect, it } from 'vitest';
import { asr, buildDepthTables, depthElement, idiv, imulHi } from './tables.js';

describe('fixed-point helpers (8086/386 semantics)', () => {
  it('idiv truncates toward zero (32÷16 signed, C/asm idiv quotient)', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3); // toward zero, not floor (-4)
    expect(idiv(524288, 9000)).toBe(58);
    expect(idiv(-1, 9000)).toBe(0);
  });

  it('asr is an arithmetic right shift (floor division by 2^n) for signed values', () => {
    expect(asr(256, 8)).toBe(1);
    expect(asr(255, 8)).toBe(0);
    expect(asr(-256, 8)).toBe(-1);
    expect(asr(-1, 8)).toBe(-1); // floor(-1/256) = -1
    expect(asr(9000, 6)).toBe(140);
  });

  it('imulHi returns the signed high word of a 16x16 product (arithmetic >>16)', () => {
    expect(imulHi(16384, 16384)).toBe(asr(16384 * 16384, 16)); // = 4096
    expect(imulHi(-16384, 16384)).toBe(asr(-(16384 * 16384), 16)); // = -4096
    expect(imulHi(100, 100)).toBe(0); // 10000 >> 16 = 0
  });
});

describe('buildDepthTables — MAIN.C depthtable{1,2,3} sprite byte rows', () => {
  const dt = buildDepthTables();

  it('encodes the 2/4/2 sprite rows as palette bytes 2+4c / 3+4c by brightness c', () => {
    // c(a) = 15 − clamp(((a−31)*3/4 + 8), 0, 15).
    // a=0 → c=15: row0/2 bytes = [62,62]; row1 = [62,63,63,62].
    expect(Array.from(dt.row0.subarray(0, 2))).toEqual([62, 62]);
    expect(Array.from(dt.row1.subarray(0, 4))).toEqual([62, 63, 63, 62]);
    expect(Array.from(dt.row2.subarray(0, 2))).toEqual([62, 62]);
    // a=63 → c=0: row0 = [2,2]; row1 = [2,3,3,2].
    expect(Array.from(dt.row0.subarray(63 * 2, 63 * 2 + 2))).toEqual([2, 2]);
    expect(Array.from(dt.row1.subarray(63 * 4, 63 * 4 + 4))).toEqual([2, 3, 3, 2]);
    // a=31 → c=7: byte = 2+28=30 / 3+28=31.
    expect(Array.from(dt.row1.subarray(31 * 4, 31 * 4 + 4))).toEqual([30, 31, 31, 30]);
  });

  it('has 128 entries per row (the original `dd 128 dup`)', () => {
    expect(dt.row0).toHaveLength(128 * 2);
    expect(dt.row1).toHaveLength(128 * 4);
    expect(dt.row2).toHaveLength(128 * 2);
  });
});

describe('depthElement — the asm `((bp>>6) & ~3) / 4` table index', () => {
  it('derives the depth-table element from the perspective divisor', () => {
    expect(depthElement(9000)).toBe(35); // (140 & ~3)/4
    expect(depthElement(5000)).toBe(19); // (78 & ~3 = 76)/4
    expect(depthElement(13000)).toBe(50); // (203 & ~3 = 200)/4
  });
});

import { describe, expect, it } from 'vitest';
import type { MarkerTable } from './marker-table.js';
import { musplusFromRow, reconstructSync } from './reconstruct.js';

describe('musplusFromRow — signed distance to the nearest bar boundary', () => {
  it('is positive in the first half of the pattern (rows since the last bar)', () => {
    expect(musplusFromRow(0)).toBe(0);
    expect(musplusFromRow(13)).toBe(13); // PLZPART waits while musplus<13 -> proceeds at row 13
    expect(musplusFromRow(31)).toBe(31);
  });

  it('is negative in the second half (rows until the next bar)', () => {
    expect(musplusFromRow(32)).toBe(-32);
    expect(musplusFromRow(44)).toBe(-20); // GLENZ <-19 still waits; LENS <-20 proceeds
    expect(musplusFromRow(45)).toBe(-19); // GLENZ proceeds here
    expect(musplusFromRow(60)).toBe(-4); // TECHNO <-4 proceeds
    expect(musplusFromRow(63)).toBe(-1);
  });

  it('reproduces the GLENZ (-16,0) window break (a<0 && a>-16) over rows 49..63', () => {
    const inWindow = (row: number) => {
      const a = musplusFromRow(row);
      return a < 0 && a > -16;
    };
    expect(inWindow(48)).toBe(false); // musplus -16
    expect(inWindow(49)).toBe(true); // -15
    expect(inWindow(63)).toBe(true); // -1
    expect(inWindow(0)).toBe(false); // 0
  });
});

describe('reconstructSync — muscode is the last Zxx code, musrow is the raw row', () => {
  const table: MarkerTable = {
    module: 'TEST',
    channels: 8,
    totalRows: 128,
    orderStartRow: [0, 64],
    markers: [
      { absRow: 4, order: 0, row: 4, ch: 0, code: 0x5b },
      { absRow: 70, order: 1, row: 6, ch: 0, code: 0xc9 },
    ],
  };

  it('is 0 before any marker, then the most recent code', () => {
    expect(reconstructSync(table, 0, 0).muscode).toBe(0);
    expect(reconstructSync(table, 0, 5).muscode).toBe(0x5b); // just after the first marker
    expect(reconstructSync(table, 1, 10).muscode).toBe(0xc9); // after the second
  });

  it('returns the raw row as musrow and the bar-relative musplus', () => {
    const s = reconstructSync(table, 1, 13);
    expect(s.musrow).toBe(13);
    expect(s.musplus).toBe(13);
  });
});

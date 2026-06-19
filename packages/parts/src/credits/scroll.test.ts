import { describe, expect, it } from 'vitest';
import { contentHeight, rowToLineRow, scrollAt } from './scroll.js';

describe('contentHeight', () => {
  it('stacks lines 30px tall with no gap (FONAY=30)', () => {
    expect(contentHeight(1)).toBe(30);
    expect(contentHeight(119)).toBe(3570);
    expect(contentHeight(0)).toBe(0);
  });
});

describe('scrollAt (1px/frame, wrapped)', () => {
  it('advances one pixel per frame', () => {
    expect(scrollAt(0, 3570)).toBe(0);
    expect(scrollAt(1, 3570)).toBe(1);
    expect(scrollAt(29, 3570)).toBe(29);
  });

  it('wraps modulo the content height so the scroll loops', () => {
    expect(scrollAt(3570, 3570)).toBe(0);
    expect(scrollAt(3571, 3570)).toBe(1);
  });

  it('is safe at the zero-height degenerate case', () => {
    expect(scrollAt(5, 0)).toBe(0);
  });

  it('handles negative frames defensively (still in range)', () => {
    expect(scrollAt(-1, 3570)).toBe(3569);
  });
});

describe('rowToLineRow (globalRow → line + font scanline)', () => {
  it('maps the first line rows 0..29 to lineIndex 0', () => {
    expect(rowToLineRow(0)).toEqual({ lineIndex: 0, fontRow: 0 });
    expect(rowToLineRow(29)).toEqual({ lineIndex: 0, fontRow: 29 });
  });

  it('rolls into the next line at the 30-pixel boundary', () => {
    expect(rowToLineRow(30)).toEqual({ lineIndex: 1, fontRow: 0 });
    expect(rowToLineRow(31)).toEqual({ lineIndex: 1, fontRow: 1 });
    expect(rowToLineRow(59)).toEqual({ lineIndex: 1, fontRow: 29 });
    expect(rowToLineRow(60)).toEqual({ lineIndex: 2, fontRow: 0 });
  });
});

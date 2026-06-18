import { describe, expect, it } from 'vitest';
import { type DepthEntry, sortByDepth } from './depth-sort.js';

const e = (index: number, bp: number): DepthEntry => ({ index, bp });

describe('sortByDepth — painter back-to-front order (far bp first → near bp last)', () => {
  it('orders entries by descending bp so near (small bp) balls draw last', () => {
    const out = sortByDepth([e(0, 9000), e(1, 13000), e(2, 5000)]);
    expect(out.map((x) => x.index)).toEqual([1, 0, 2]); // 13000, 9000, 5000
  });

  it('is stable for equal bp (preserves the scrambled input order among ties)', () => {
    const out = sortByDepth([e(7, 9000), e(3, 9000), e(5, 9000)]);
    expect(out.map((x) => x.index)).toEqual([7, 3, 5]);
  });

  it('does not mutate the input array', () => {
    const input = [e(0, 1), e(1, 2)];
    sortByDepth(input);
    expect(input.map((x) => x.index)).toEqual([0, 1]);
  });

  it('handles an empty list', () => {
    expect(sortByDepth([])).toEqual([]);
  });
});

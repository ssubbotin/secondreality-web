import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { POS_ENTRIES, parsePos, SCREEN_PIXELS } from './pos.js';

const pos1 = (): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL('./__fixtures__/POS1.DAT', import.meta.url))));

describe('parsePos (FOREST POS*.DAT warp tables)', () => {
  it('reads exactly 7347 entries (237×31 font pixels)', () => {
    const t = parsePos(pos1());
    expect(POS_ENTRIES).toBe(7347);
    expect(t.count.length).toBe(POS_ENTRIES);
    expect(t.start.length).toBe(POS_ENTRIES);
  });

  it('matches the byte-exact entry counts from POS1.DAT', () => {
    const t = parsePos(pos1());
    expect(t.count[0]).toBe(0); // first font pixel is hidden
    expect(t.count[6]).toBe(11); // first lit font pixel
    expect(t.count[1000]).toBe(2);
    expect(t.count[7131]).toBe(15); // the entry with the most destinations
    expect(t.count[POS_ENTRIES - 1]).toBe(0); // last entry hidden
  });

  it('matches the byte-exact destination offsets from POS1.DAT', () => {
    const t = parsePos(pos1());
    // entry 6, first five destinations
    const s6 = t.start[6] ?? 0;
    expect(Array.from(t.dests.subarray(s6, s6 + 5))).toEqual([46400, 46401, 46720, 46721, 46722]);
    // entry 1000, both destinations
    const s1000 = t.start[1000] ?? 0;
    expect(Array.from(t.dests.subarray(s1000, s1000 + 2))).toEqual([24768, 25090]);
    // entry 7131, first destination
    const s7131 = t.start[7131] ?? 0;
    expect(t.dests[s7131]).toBe(61305);
  });

  it('totals 5197 destinations and consumes the whole file', () => {
    const t = parsePos(pos1());
    expect(t.total).toBe(5197);
    expect(t.dests.length).toBe(5197);
    // 7347 count words (14694 bytes) + 5197 dest words (10394 bytes) = 25088 = POS1.DAT size
    expect(7347 * 2 + 5197 * 2).toBe(pos1().length);
  });

  it('keeps every destination within the 320×200 screen', () => {
    const t = parsePos(pos1());
    let max = 0;
    for (const v of t.dests) if (v > max) max = v;
    expect(max).toBeLessThan(SCREEN_PIXELS);
  });

  it('lays start[i] out as the running prefix sum of count', () => {
    const t = parsePos(pos1());
    let acc = 0;
    for (let i = 0; i < POS_ENTRIES; i++) {
      expect(t.start[i]).toBe(acc);
      acc += t.count[i] ?? 0;
    }
    expect(acc).toBe(t.total);
  });

  it('throws on a truncated buffer', () => {
    expect(() => parsePos(new Uint8Array([1, 0]))).toThrow(/truncated/);
  });
});

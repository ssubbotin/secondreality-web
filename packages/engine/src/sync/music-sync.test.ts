import { describe, expect, it } from 'vitest';
import type { ClockSample } from '../audio/clock.js';
import type { MarkerTable } from './marker-table.js';
import { MusicSync } from './music-sync.js';

const table: MarkerTable = {
  module: 'TEST',
  channels: 8,
  totalRows: 128,
  orderStartRow: [0, 64],
  markers: [{ absRow: 4, order: 0, row: 4, ch: 0, code: 0x5b }],
};
const base: ClockSample = { songSeconds: 10, order: 1, row: 13, pattern: 9, bpm: 125 };

describe('MusicSync', () => {
  it('resolves a base ClockSample into the full four-channel MusicClock', () => {
    const sync = new MusicSync(table);
    const c = sync.resolve(base);
    expect(c.muscode).toBe(0x5b); // last marker at-or-before order1/row13
    expect(c.musplus).toBe(13); // row 13 -> +13 (first half of bar)
    expect(c.musrow).toBe(13);
    expect(c.songSeconds).toBe(10);
    expect(c.order).toBe(1);
    expect(c.pattern).toBe(9);
    expect(c.bpm).toBe(125);
  });

  it('mframe respects setMframe (part-resettable)', () => {
    const sync = new MusicSync(table);
    sync.setMframe(10, 0);
    expect(sync.resolve(base).mframe).toBe(0);
    expect(sync.resolve({ ...base, songSeconds: 11 }).mframe).toBe(70); // +1s at 70Hz
  });
});

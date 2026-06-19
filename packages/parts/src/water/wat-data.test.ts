import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FRAME_RECORDS, parseWatFrame, SCREEN_PIXELS } from './wat-data.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

// Oracle figures measured directly from the vendored DOS data (independent parser).
const ORACLE: Record<string, { bytes: number; totalPos: number }> = {
  'WAT1.DAT': { bytes: 23096, totalPos: 6176 },
  'WAT2.DAT': { bytes: 23034, totalPos: 6145 },
  'WAT3.DAT': { bytes: 27818, totalPos: 8537 },
};

describe('parseWatFrame', () => {
  for (const [name, exp] of Object.entries(ORACLE)) {
    it(`${name}: 5372 records, ${exp.totalPos} positions, fully consumed (${exp.bytes} bytes)`, () => {
      const raw = fixture(name);
      expect(raw.length).toBe(exp.bytes);
      const frame = parseWatFrame(new Uint8Array(raw));
      expect(frame.records).toHaveLength(FRAME_RECORDS);
      expect(frame.totalPos).toBe(exp.totalPos);
      // Byte budget: 2 bytes per record header + 2 bytes per position == the whole file (no trailing).
      expect(FRAME_RECORDS * 2 + exp.totalPos * 2).toBe(exp.bytes);
      // Every destination offset is a valid 320×200 screen index.
      for (const rec of frame.records) {
        expect(rec.pos).toHaveLength(rec.count);
        for (const p of rec.pos) expect(p).toBeLessThan(SCREEN_PIXELS);
      }
    });
  }

  it('reproduces the first non-empty record of WAT1.DAT byte-for-byte', () => {
    const raw = fixture('WAT1.DAT');
    const frame = parseWatFrame(new Uint8Array(raw));
    // From the hexdump: the stream is leading zero-count records, then record with count=1 → pos=0xd6ea.
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    // Walk to the first count != 0 and assert parser agrees with a raw little-endian read.
    let off = 0;
    let idx = 0;
    while (idx < FRAME_RECORDS) {
      const count = view.getUint16(off, true);
      off += 2;
      if (count !== 0) {
        const rec = frame.records[idx];
        expect(rec?.count).toBe(count);
        expect(rec?.pos[0]).toBe(view.getUint16(off, true));
        break;
      }
      idx += 1;
    }
  });

  it('throws on a truncated frame', () => {
    expect(() => parseWatFrame(new Uint8Array(4))).toThrow(/truncated/);
  });
});

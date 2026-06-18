import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildSin1024,
  buildWave2,
  buildZwave,
  parseWaveField,
  WAVE_FIELD_WORDS,
  WAVESIN,
} from './tables.js';

// vitest's node environment; *.test.ts are excluded from tsc, so node:fs/url need no @types/node.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('comanche tables', () => {
  it('buildSin1024 reproduces SIN1024.INC byte-for-byte (1024 Int16LE)', () => {
    const dat = fixture('SIN1024.DAT');
    const sin = buildSin1024();
    expect(sin).toHaveLength(1024);
    for (let i = 0; i < 1024; i++) expect(sin[i]).toBe(dat.readInt16LE(i * 2));
  });

  it('WAVESIN matches WAVE.H byte-for-byte (1024 Int16LE)', () => {
    const dat = fixture('WAVESIN.DAT');
    expect(WAVESIN).toHaveLength(1024);
    for (let i = 0; i < 1024; i++) expect(WAVESIN[i]).toBe(dat.readInt16LE(i * 2));
  });

  it('buildZwave matches the height offsets baked into the shipped THELOOP.INC (zwave[j] = bx + 240)', () => {
    const z = buildZwave();
    expect(z).toHaveLength(192);
    // [j, zwave] pairs read out of THELOOP.INC `add bx,N` (N = zwave[j] − 240).
    const oracle: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 1],
      [2, 3],
      [3, 4],
      [4, 6],
      [5, 7],
      [6, 8],
      [7, 10],
      [16, 16],
      [32, 0],
      [48, -16],
      [62, -3],
      [63, -1],
      [64, 0],
      [66, 3],
      [96, 0],
      [128, 0],
      [160, 0],
      [188, -6],
      [190, -3],
    ];
    for (const [j, v] of oracle) expect(z[j]).toBe(v);
  });

  it('parseWaveField is an identity Int16LE read of W1DTA.BIN (32768 words, plausible range)', () => {
    const dat = fixture('W1DTA.BIN');
    const ab = dat.buffer.slice(dat.byteOffset, dat.byteOffset + dat.byteLength);
    const w1 = parseWaveField(ab);
    expect(w1).toHaveLength(WAVE_FIELD_WORDS);
    for (let i = 0; i < WAVE_FIELD_WORDS; i++) expect(w1[i]).toBe(dat.readInt16LE(i * 2));
    // The rand()-tainted X-wave is vendored verbatim; just sanity-check the value range.
    let min = Infinity;
    let max = -Infinity;
    for (const v of w1) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(-128);
    expect(max).toBeLessThanOrEqual(127);
  });

  it('buildWave2 reproduces W2DTA.BIN byte-for-byte (the deterministic Y-wave generator)', () => {
    const dat = fixture('W2DTA.BIN');
    const w2 = buildWave2(WAVESIN);
    expect(w2).toHaveLength(WAVE_FIELD_WORDS);
    for (let i = 0; i < WAVE_FIELD_WORDS; i++) expect(w2[i]).toBe(dat.readInt16LE(i * 2));
  });
});

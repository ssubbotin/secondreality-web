import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WAVE_FIELD_WORDS } from './tables.js';
import { decodeW1dta } from './w1dta.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('comanche embedded W1DTA', () => {
  it('decodeW1dta reproduces W1DTA.BIN byte-for-byte (32768 signed words)', () => {
    const dat = fixture('W1DTA.BIN');
    const w1 = decodeW1dta();
    expect(w1).toHaveLength(WAVE_FIELD_WORDS);
    for (let i = 0; i < WAVE_FIELD_WORDS; i++) expect(w1[i]).toBe(dat.readInt16LE(i * 2));
  });
});

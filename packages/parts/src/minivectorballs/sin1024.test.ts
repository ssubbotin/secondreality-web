import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { icos, isin, sin1024 } from './sin1024.js';

// Tests run in vitest's node environment and are excluded from tsc (parts tsconfig excludes *.test.ts),
// so node:fs/node:url are fine here without @types/node.
const fixtureText = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

/** Parse the `dw a,b,c,...` words out of DOTS/SIN1024.INC into a flat Int16Array (the oracle). */
function parseInc(text: string): Int16Array {
  const out: number[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim(); // tolerate CRLF / trailing whitespace
    const m = line.match(/^dw\s+(.+)$/);
    if (!m) continue;
    for (const tok of (m[1] ?? '').split(',')) out.push(Number.parseInt(tok.trim(), 10));
  }
  return Int16Array.from(out);
}

describe('sin1024 — faithful port of DOTS/SIN1024.INC', () => {
  it('reproduces SIN1024.INC byte-for-byte (1024 signed words, amplitude 256, truncated)', () => {
    const oracle = parseInc(fixtureText('SIN1024.INC'));
    expect(oracle).toHaveLength(1024);
    expect(sin1024).toHaveLength(1024);
    for (let i = 0; i < 1024; i++) expect(sin1024[i]).toBe(oracle[i]);
  });

  it('matches published spot values', () => {
    expect(sin1024[0]).toBe(0);
    expect(sin1024[1]).toBe(1);
    expect(sin1024[2]).toBe(3);
    expect(sin1024[256]).toBe(256); // peak
    expect(sin1024[512]).toBe(0);
    expect(sin1024[768]).toBe(-256); // trough
  });
});

describe('isin/icos — MAIN.C deg helpers (sin1024[deg&1023], sin1024[(deg+256)&1023])', () => {
  it('isin indexes sin1024 with &1023, wrapping arbitrary angles', () => {
    expect(isin(0)).toBe(sin1024[0]);
    expect(isin(256)).toBe(sin1024[256]);
    expect(isin(1024)).toBe(sin1024[0]);
    expect(isin(-1)).toBe(sin1024[1023]);
    expect(isin(2050)).toBe(sin1024[2]);
  });

  it('icos is isin shifted by a quarter period (+256)', () => {
    expect(icos(0)).toBe(sin1024[256]); // = 256
    expect(icos(256)).toBe(sin1024[512]); // = 0
    expect(icos(-256)).toBe(sin1024[0]); // = 0
  });
});

import { describe, expect, it } from 'vitest';
import { parseDw } from './__fixtures__/parse.js';
import { sin1024, sinAt } from './sin1024.js';

describe('sin1024 — verbatim port of GLENZ/SIN1024.INC', () => {
  it('reproduces SIN1024.INC byte-for-byte (1024 signed words, amplitude 256)', () => {
    const want = parseDw('SIN1024.INC');
    expect(want).toHaveLength(1024);
    expect(sin1024).toHaveLength(1024);
    for (let i = 0; i < 1024; i++) expect(sin1024[i]).toBe(want[i]);
  });

  it('has the published peaks/zeros', () => {
    expect(sin1024[0]).toBe(0);
    expect(sin1024[256]).toBe(256);
    expect(sin1024[512]).toBe(0);
    expect(sin1024[768]).toBe(-256);
  });
});

describe('sinAt — wraps arbitrary angles into the table, matching `(a)&1023`', () => {
  it('wraps whole periods and negatives', () => {
    expect(sinAt(0)).toBe(sin1024[0]);
    expect(sinAt(1024)).toBe(sin1024[0]);
    expect(sinAt(-256)).toBe(sin1024[768]);
    expect(sinAt(2050)).toBe(sin1024[2]);
  });
});

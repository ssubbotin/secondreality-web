import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildMuldivX, buildMuldivY, Lcg, sin1024 } from './tables.js';

// Tests run in vitest's node environment and are excluded from tsc (parts tsconfig excludes *.test.ts),
// so node:fs/node:url are fine here without @types/node.
const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8');

/** Parse the `dw a,b,c` rows of a MASM include into a flat list of signed integers. */
function parseDw(text: string): number[] {
  const out: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*dw\s+(.*)$/);
    if (!m) continue;
    for (const tok of (m[1] ?? '').split(',')) {
      const v = Number.parseInt(tok.trim(), 10);
      if (!Number.isNaN(v)) out.push(v);
    }
  }
  return out;
}

describe('ddstars tables', () => {
  it('sin1024 reproduces SIN1024.INC word-for-word (1024 signed shorts)', () => {
    const oracle = parseDw(fixture('SIN1024.INC'));
    expect(oracle).toHaveLength(1024);
    expect(sin1024).toHaveLength(1024);
    for (let i = 0; i < 1024; i++) expect(sin1024[i]).toBe(oracle[i]);
  });

  it('buildMuldivY/X match the inline generator trunc(N·65536 / (150+4i)) >> 1', () => {
    const my = buildMuldivY();
    const mx = buildMuldivX();
    expect(my).toHaveLength(256);
    expect(mx).toHaveLength(256);
    for (let i = 0; i < 256; i++) {
      const d = 150 + 4 * i;
      expect(my[i]).toBe(Math.trunc((108 * 65536) / d) >> 1);
      expect(mx[i]).toBe(Math.trunc((144 * 65536) / d) >> 1);
    }
    // Spot endpoints (near = big scale, far = small scale).
    expect(my[0]).toBe(23592);
    expect(mx[0]).toBe(31457);
    expect(my[255]).toBe(3024);
    expect(mx[255]).toBe(4032);
  });

  it('Lcg reproduces seed·0x343FD + 0x269EC3, returning the high word', () => {
    const r = new Lcg(0);
    // Hand-computed: seed0 → 0x269EC3 → high word 0x0026 = 38, etc.
    expect([r.next(), r.next(), r.next(), r.next(), r.next()]).toEqual([
      38, 7719, 54006, 2437, 41623,
    ]);
  });

  it('Lcg seeds default to 0 and stay in 0..65535', () => {
    const r = new Lcg();
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(65535);
    }
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cos16, DEG, sin16 } from './mathsin.js';

// Tests run in vitest's node environment and are excluded from tsc, so node:fs/node:url are fine here.
function parseDw(name: string): number[] {
  const text = readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)),
    'utf8',
  );
  const out: number[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = line.match(/^\s*dw\s+(.+)$/i);
    if (!m) continue;
    for (const tok of (m[1] ?? '').split(',')) {
      const t = tok.trim();
      if (t.length > 0) out.push(Number.parseInt(t, 10));
    }
  }
  return out;
}

// MATHSIN.INC ships `sintable16` (the rising quarter: 900 words) immediately followed by `costable16`
// (a full-period cosine: 3600 words). Concatenated, the parseDw stream is [sin-quarter(900), cos(3600)].
function tables(): { sinQuarter: number[]; cos: number[] } {
  const all = parseDw('MATHSIN.INC');
  return { sinQuarter: all.slice(0, 900), cos: all.slice(900) };
}

describe('mathsin — verbatim 16-bit sine/cosine tables (GLENZ/MATHSIN.INC)', () => {
  it('regenerates the sintable16 rising quarter byte-for-byte (900 words)', () => {
    const { sinQuarter } = tables();
    expect(sinQuarter).toHaveLength(900);
    for (let d = 0; d < 900; d++) expect(sin16(d)).toBe(sinQuarter[d]);
  });

  it('regenerates costable16 byte-for-byte (a full 3600-degree period)', () => {
    const { cos } = tables();
    expect(cos).toHaveLength(DEG);
    for (let d = 0; d < DEG; d++) expect(cos16(d)).toBe(cos[d]);
  });

  it('has the documented anchors (amplitude 32767, 3600-degree period)', () => {
    expect(sin16(0)).toBe(0);
    expect(sin16(900)).toBe(32767); // 90 degrees
    expect(cos16(0)).toBe(32767);
    expect(cos16(900)).toBe(0); // 90 degrees
  });

  it('wraps degrees into [0,3600) like checkdeg', () => {
    expect(sin16(3600)).toBe(sin16(0));
    expect(sin16(-900)).toBe(sin16(2700));
    expect(cos16(3601)).toBe(cos16(1));
  });

  it('cos16(d) === sin16(d+900) except the documented 240-degree tie', () => {
    for (const d of [0, 1, 17, 450, 899, 1800, 3599]) expect(cos16(d)).toBe(sin16(d + 900));
    // The single 16383.5 build-order tie the assembler rounded the opposite way.
    expect(cos16(2400)).toBe(-16383);
  });
});

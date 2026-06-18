import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeU } from './decode-u.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

/** Parse the original `FONA.INC` (Turbo Assembler `db` lines) into the raw `font` byte array. */
function parseFonaInc(): Uint8Array {
  const text = new TextDecoder().decode(fixture('FONA.INC'));
  const out: number[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('db')) continue;
    for (const tok of t.slice(2).split(',')) {
      const s = tok.trim();
      if (s.length > 0) out.push(Number.parseInt(s, 10));
    }
  }
  return Uint8Array.from(out);
}

describe('decodeU', () => {
  it('reads the FONA.UH header', () => {
    const d = decodeU(fixture('FONA.UH'));
    expect(d.width).toBe(1500);
    expect(d.height).toBe(30);
    expect(d.cols).toBe(256);
  });

  it('decodes a 256-colour, 6-bit palette', () => {
    const d = decodeU(fixture('FONA.UH'));
    expect(d.palette.length).toBe(256 * 3);
    for (const v of d.palette) expect(v).toBeLessThanOrEqual(63);
  });

  it('decodes pixel indices byte-exact against the original FONA.INC font array', () => {
    const d = decodeU(fixture('FONA.UH'));
    const inc = parseFonaInc();
    expect(d.indices.length).toBe(1500 * 30);
    // FONA.INC carries one trailing pad byte (45001 vs 45000); compare the image region.
    expect(d.indices).toEqual(inc.subarray(0, 1500 * 30));
  });
});

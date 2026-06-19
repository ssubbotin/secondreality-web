import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeHoi } from './hoi.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe('decodeHoi (hzpic read path, MAIN.C init())', () => {
  it('reads the 640×200 HOI geometry', () => {
    const d = decodeHoi(fixture('HOI.U'));
    expect(d.width).toBe(640);
    expect(d.height).toBe(200);
    expect(d.indices.length).toBe(640 * 200);
  });

  it('copies the 6-bit VGA palette from offset 16 (memcpy(palette, hzpic+16, 768))', () => {
    const buf = fixture('HOI.U');
    const d = decodeHoi(buf);
    expect(d.palette.length).toBe(256 * 3);
    for (const v of d.palette) expect(v).toBeLessThanOrEqual(63);
    // Byte-exact against hzpic+16.
    for (let i = 0; i < 768; i++) expect(d.palette[i]).toBe(buf[16 + i]);
  });

  it('reads the raw pixels at paragraph add (add*16 = 784) — a horizon, indices 0..63', () => {
    const d = decodeHoi(fixture('HOI.U'));
    let max = 0;
    for (const v of d.indices) if (v > max) max = v;
    // The horizon uses a low band of the palette (verified: indices span 0..52).
    expect(max).toBeLessThanOrEqual(63);
    expect(max).toBeGreaterThan(0);
  });
});

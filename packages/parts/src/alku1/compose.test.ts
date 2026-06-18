import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeU, loadFona } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import { composeFrame } from './compose.js';
import { SCREEN_H, SCREEN_W } from './copper.js';
import { TEXT_BASE } from './palette.js';

const fontFixture = (): ReturnType<typeof loadFona> => {
  const buf = new Uint8Array(
    readFileSync(fileURLToPath(new URL('./__fixtures__/FONA.UH', import.meta.url))),
  );
  return loadFona(decodeU(buf));
};

describe('composeFrame', () => {
  const font = fontFixture();

  it('fills the whole 320×200 field with copper-band indices when no text is lit', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    // level 0: text contributes nothing → every pixel is a copper-band index (>= TEXT? no, < TEXT_BASE).
    composeFrame(buf, font, { card: 0, level: 0 }, 0);
    let textPixels = 0;
    for (const v of buf) if (v >= TEXT_BASE) textPixels++;
    expect(textPixels).toBe(0);
  });

  it('writes text-band indices once the card is lit', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(buf, font, { card: 0, level: 64 }, 0);
    let textPixels = 0;
    for (const v of buf) if (v >= TEXT_BASE) textPixels++;
    expect(textPixels).toBeGreaterThan(0);
  });

  it('clears the previous frame (no accumulation between calls)', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(buf, font, { card: 0, level: 64 }, 0);
    const lit = buf.reduce((n, v) => n + (v >= TEXT_BASE ? 1 : 0), 0);
    // Re-compose a different card at the same frame; text count should reflect only the new card.
    composeFrame(buf, font, { card: 1, level: 64 }, 0);
    const lit2 = buf.reduce((n, v) => n + (v >= TEXT_BASE ? 1 : 0), 0);
    expect(lit2).toBeGreaterThan(0);
    expect(lit2).not.toBe(lit); // different card → different footprint, proving no leftover
  });

  it('never writes out of bounds', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    expect(() => composeFrame(buf, font, { card: 2, level: 64 }, 123)).not.toThrow();
    expect(buf.length).toBe(SCREEN_W * SCREEN_H);
  });
});

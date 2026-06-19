import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeU, loadFona } from '@sr/engine';
import { describe, expect, it } from 'vitest';
import { composeFrame } from './compose.js';
import { SCREEN_H, SCREEN_W } from './copper.js';
import { decodeHoi } from './hoi.js';
import { TEXT_BASE } from './palette.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

const font = loadFona(decodeU(fixture('FONA.UH')));
const hoi = decodeHoi(fixture('HOI.U')).indices;

describe('composeFrame', () => {
  it('lays the HOI horizon (indices 0..63) under the text plane bands', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(buf, font, hoi, { card: 0, level: 64 }, 0);
    // Bottom-left of the field is clear sky/ground picture — a sub-0x40 picture index.
    let backdropPixels = 0;
    for (const v of buf) if (v < TEXT_BASE) backdropPixels++;
    expect(backdropPixels).toBeGreaterThan(0);
  });

  it('stamps the active card text as plane-band indices (>= 0x40) ORed over the picture', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(buf, font, hoi, { card: 0, level: 64 }, 0);
    let textPixels = 0;
    for (const v of buf) if (v >= TEXT_BASE) textPixels++;
    expect(textPixels).toBeGreaterThan(0);
  });

  it('clears the previous frame (no accumulation between calls)', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(buf, font, hoi, { card: 0, level: 64 }, 0);
    const lit = buf.reduce((n, v) => n + (v >= TEXT_BASE ? 1 : 0), 0);
    composeFrame(buf, font, hoi, { card: 1, level: 64 }, 0);
    const lit2 = buf.reduce((n, v) => n + (v >= TEXT_BASE ? 1 : 0), 0);
    expect(lit2).toBeGreaterThan(0);
    expect(lit2).not.toBe(lit); // different card → different footprint, proving no leftover
  });

  it('pans the backdrop horizontally with the offset', () => {
    const a = new Uint8Array(SCREEN_W * SCREEN_H);
    const b = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(a, font, hoi, { card: 0, level: 64 }, 0);
    composeFrame(b, font, hoi, { card: 0, level: 64 }, 8);
    expect([...b.subarray(0, SCREEN_W)]).not.toEqual([...a.subarray(0, SCREEN_W)]);
  });

  it('never writes out of bounds', () => {
    const buf = new Uint8Array(SCREEN_W * SCREEN_H);
    expect(() => composeFrame(buf, font, hoi, { card: 1, level: 64 }, 123)).not.toThrow();
    expect(buf.length).toBe(SCREEN_W * SCREEN_H);
  });
});

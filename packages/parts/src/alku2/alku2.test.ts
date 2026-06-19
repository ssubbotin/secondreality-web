import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCardBuffers } from './alku2.js';
import { composeFrame } from './compose.js';
import { SCREEN_H, SCREEN_W } from './copper.js';
import { decodeU, loadFona } from './font.js';
import { decodeHoi } from './hoi.js';
import { buildAlku2Palette } from './palette.js';
import { CREDIT_CARDS } from './scroll.js';

const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe('buildCardBuffers', () => {
  it('stamps one non-empty buffer per credit card', () => {
    const font = loadFona(decodeU(fixture('FONA.UH')));
    const bufs = buildCardBuffers(font);
    expect(bufs.length).toBe(CREDIT_CARDS.length);
    for (const buf of bufs) {
      let lit = 0;
      for (const v of buf) if (v !== 0) lit++;
      expect(lit).toBeGreaterThan(0);
    }
  });

  it('stamps only plane bytes (0x40/0x80/0xC0) into the buffers', () => {
    const font = loadFona(decodeU(fixture('FONA.UH')));
    for (const buf of buildCardBuffers(font)) {
      for (const v of buf) {
        if (v !== 0) expect([0x40, 0x80, 0xc0]).toContain(v);
      }
    }
  });
});

describe('frame composition (integration)', () => {
  it('produces lit text indices over the HOI backdrop when a card is on-screen', () => {
    const font = loadFona(decodeU(fixture('FONA.UH')));
    const hoiDecoded = decodeHoi(fixture('HOI.U'));
    const palette = buildAlku2Palette(hoiDecoded.palette);
    const bufs = buildCardBuffers(font);
    const card0 = bufs[0];
    expect(card0).toBeDefined();
    if (!card0) return;

    const index = new Uint8Array(SCREEN_W * SCREEN_H);
    // Centre the card on-screen: textScroll = SCREEN_W (originX = 0) puts the centred card mid-field.
    composeFrame(index, hoiDecoded.indices, card0, 0, SCREEN_W);

    // Some pixels carry a high plane band (>= 0x40) — the lit credits over the 0..63 picture.
    let litPixels = 0;
    for (const v of index) if (v >= 0x40) litPixels++;
    expect(litPixels).toBeGreaterThan(0);

    // Every index resolves to an in-range 6-bit colour through the palette.
    for (const v of index) {
      expect(palette[v * 3] ?? 0).toBeLessThanOrEqual(63);
    }
  });

  it('is deterministic: the same frame composes identically', () => {
    const font = loadFona(decodeU(fixture('FONA.UH')));
    const hoi = decodeHoi(fixture('HOI.U')).indices;
    const buf = buildCardBuffers(font)[1];
    expect(buf).toBeDefined();
    if (!buf) return;
    const a = new Uint8Array(SCREEN_W * SCREEN_H);
    const b = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(a, hoi, buf, 42, 120);
    composeFrame(b, hoi, buf, 42, 120);
    expect(a).toEqual(b);
  });

  it('centres the card on-screen when its travel places the buffer at originX≈0', () => {
    // The buffer is stamped centred on CENTER_X=160 within the 352-wide tbuf. With textScroll = SCREEN_W
    // (the effect's mapping at the window midpoint), textOriginX = 0, so tbuf column 160 lands at screen
    // x≈160 — the card reads centred. Assert the lit span straddles the screen centre.
    const font = loadFona(decodeU(fixture('FONA.UH')));
    const hoi = decodeHoi(fixture('HOI.U')).indices;
    const buf = buildCardBuffers(font)[0];
    expect(buf).toBeDefined();
    if (!buf) return;
    const index = new Uint8Array(SCREEN_W * SCREEN_H);
    composeFrame(index, hoi, buf, 0, SCREEN_W);
    let minX = SCREEN_W;
    let maxX = -1;
    for (let y = 0; y < SCREEN_H; y++) {
      for (let x = 0; x < SCREEN_W; x++) {
        if ((index[y * SCREEN_W + x] ?? 0) >= 0x40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    expect(maxX).toBeGreaterThan(minX);
    const mid = (minX + maxX) / 2;
    expect(Math.abs(mid - SCREEN_W / 2)).toBeLessThan(40);
  });
});

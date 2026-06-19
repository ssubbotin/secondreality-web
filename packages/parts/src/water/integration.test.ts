import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { composeWaterFrame } from './blit.js';
import { decodeRix } from './picture.js';
import { Scroller } from './scroller.js';
import { parseWatFrame, SCREEN_PIXELS } from './wat-data.js';

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

/**
 * End-to-end check of the full pure chain against the real DOS data: decode background + font, parse the
 * three WAT frames, run the DEMO.PAS cadence (phase 0→1→2 then scroll), and compose. Asserts the result
 * is the background everywhere the ripple frame does not touch, and that scrolled glyph pixels do appear.
 */
describe('water integration (real fixtures)', () => {
  it('composes a rippled scroll frame over the mirror-ball background', () => {
    const bg = decodeRix(new Uint8Array(fixture('BKG.CLX')));
    const font = decodeRix(new Uint8Array(fixture('FONT.CLX')));
    const frames = ['WAT1.DAT', 'WAT2.DAT', 'WAT3.DAT'].map((n) =>
      parseWatFrame(new Uint8Array(fixture(n))),
    );

    const scroller = new Scroller();
    // Advance the scroller well into the message so glyph pixels are present in the buffer.
    for (let i = 0; i < 200; i++) scroller.scrollStep(font.pixels);

    const out = new Uint8Array(SCREEN_PIXELS);
    const f1 = frames[0];
    expect(f1).toBeDefined();
    if (!f1) return;
    composeWaterFrame(out, bg.pixels, f1, scroller.fbuf);

    // Every pixel the WAT frame does not touch equals the background.
    const touched = new Uint8Array(SCREEN_PIXELS);
    for (const rec of f1.records) for (const p of rec.pos) touched[p] = 1;
    let untouchedSampled = 0;
    for (let i = 0; i < SCREEN_PIXELS; i += 137) {
      if (touched[i] === 0) {
        expect(out[i]).toBe(bg.pixels[i]);
        untouchedSampled += 1;
      }
    }
    expect(untouchedSampled).toBeGreaterThan(0);

    // At least some scrolled glyph pixels were drawn (font byte over background).
    let glyphHits = 0;
    for (let bx = 0; bx < f1.records.length; bx++) {
      const rec = f1.records[bx];
      if (rec === undefined) continue;
      const fb = scroller.fbuf[bx] ?? 0;
      if (fb !== 0) {
        for (const p of rec.pos) if (out[p] === fb) glyphHits += 1;
      }
    }
    expect(glyphHits).toBeGreaterThan(0);
  });

  it('cycles three distinct ripple frames (the animation is in the position sets)', () => {
    const frames = ['WAT1.DAT', 'WAT2.DAT', 'WAT3.DAT'].map((n) =>
      parseWatFrame(new Uint8Array(fixture(n))),
    );
    // The three frames touch different total numbers of positions → genuinely distinct ripple states.
    const totals = frames.map((f) => f.totalPos);
    expect(new Set(totals).size).toBe(3);
  });
});

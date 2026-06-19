import { describe, expect, it } from 'vitest';
import { SCREEN_H, SCREEN_W } from './raster.js';
import {
  advanceReveal,
  compositeReveal,
  createRevealState,
  REVEAL_FRAME_BLOCK1,
  REVEAL_FRAME_BLOCK2,
  STARTXTOPEN_ARM,
  STARTXTP0_BLOCK1,
  STARTXTP0_BLOCK2,
  scheduleReveal,
  TEXTPIC_DATA_OFFSET,
} from './reveal.js';

/** Build a tiny synthetic _textpic where source row r is filled with index ((r % 3) + 1). */
function synthTextpic(width = SCREEN_W, height = SCREEN_H): Uint8Array {
  const t = new Uint8Array(width * height);
  for (let r = 0; r < height; r++) t.fill((r % 3) + 1, r * width, (r + 1) * width);
  return t;
}

describe('reveal schedule (do_stars @@st1/@@st2)', () => {
  it('arms nothing before frame 1200', () => {
    const s = createRevealState();
    for (let f = 1; f < REVEAL_FRAME_BLOCK1; f++) scheduleReveal(s, f);
    expect(s.startxtopen).toBe(-9999);
    expect(s.startxtclose).toBe(10000);
    expect(s.startxtp0).toBe(0);
  });

  it('arms block 1 at frame 1200 (startxtp0 = 80, source row 1)', () => {
    const s = createRevealState();
    scheduleReveal(s, REVEAL_FRAME_BLOCK1);
    expect(s.startxtp0).toBe(STARTXTP0_BLOCK1);
    expect(s.startxtp0).toBe(80);
    expect(s.startxtopen).toBe(STARTXTOPEN_ARM);
    expect(s.startxtclose).toBe(1500);
  });

  it('arms block 2 at frame 3200 (startxtp0 = 101*80, source row 101)', () => {
    const s = createRevealState();
    scheduleReveal(s, REVEAL_FRAME_BLOCK2);
    expect(s.startxtp0).toBe(STARTXTP0_BLOCK2);
    expect(s.startxtp0).toBe(8080);
    expect(s.startxtopen).toBe(STARTXTOPEN_ARM);
    expect(s.startxtclose).toBe(1500);
  });
});

describe('reveal counters (risetext open/close ramp)', () => {
  it('open ramps up (cap 99), close ramps down (floor 0), use = min', () => {
    const s = createRevealState();
    scheduleReveal(s, REVEAL_FRAME_BLOCK1); // open=-256, close=1500
    // 256 ticks to bring open to 0, then it keeps climbing to 99 and caps.
    let use = 0;
    for (let i = 0; i < 256; i++) use = advanceReveal(s);
    expect(s.startxtopen).toBe(0); // -256 + 256
    expect(use).toBe(0); // min(0, 1500-256)
    // Next ticks: open keeps rising while close stays high → use tracks open until the cap.
    for (let i = 0; i < 99; i++) use = advanceReveal(s);
    expect(s.startxtopen).toBe(99);
    expect(use).toBe(99);
    // Further ticks: open is capped at 99, use stays 99 until close drops below it (far later).
    use = advanceReveal(s);
    expect(s.startxtopen).toBe(99);
    expect(use).toBe(99);
  });

  it('eventually closes (use returns to 0 as startxtclose drains)', () => {
    const s = createRevealState();
    scheduleReveal(s, REVEAL_FRAME_BLOCK1);
    let use = 1;
    for (let i = 0; i < 1500; i++) use = advanceReveal(s);
    expect(s.startxtclose).toBe(0);
    expect(use).toBe(0);
  });
});

describe('compositeReveal (risetext curtain geometry)', () => {
  it('does nothing when use <= 0', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H).fill(7);
    compositeReveal(out, 0, TEXTPIC_DATA_OFFSET + 80, synthTextpic(), SCREEN_W, SCREEN_H);
    expect([...new Set(out)]).toEqual([7]);
  });

  it('use=5 → top-lip row 144, black row 145, source-row-1 copy at row 146, bottom-lip row 147', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H).fill(9);
    const tp = synthTextpic();
    compositeReveal(out, 5, TEXTPIC_DATA_OFFSET + STARTXTP0_BLOCK1, tp, SCREEN_W, SCREEN_H);
    const rowVal = (r: number) => out[r * SCREEN_W + 10] ?? -1;
    expect(rowVal(143)).toBe(9); // untouched above the curtain
    expect(rowVal(144)).toBe(0); // top lip (black)
    expect(rowVal(145)).toBe(0); // black row
    expect(rowVal(146)).toBe((1 % 3) + 1); // source row 1 → index 2
    expect(rowVal(147)).toBe(0); // bottom lip (black)
    expect(rowVal(148)).toBe(9); // untouched below
  });

  it('grows upward as use increases (use=99 spans rows 50..147)', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H).fill(9);
    compositeReveal(
      out,
      99,
      TEXTPIC_DATA_OFFSET + STARTXTP0_BLOCK1,
      synthTextpic(),
      SCREEN_W,
      SCREEN_H,
    );
    const touched = (r: number) => (out[r * SCREEN_W + 10] ?? 9) !== 9;
    expect(touched(49)).toBe(false);
    expect(touched(50)).toBe(true); // 150 - 99 - 1
    expect(touched(147)).toBe(true); // bottom lip
    expect(touched(148)).toBe(false);
  });

  it('overwrites the star pixels in the text band (text replaces stars, not adds)', () => {
    const out = new Uint8Array(SCREEN_W * SCREEN_H).fill(3); // pretend every pixel is a bright star
    compositeReveal(
      out,
      10,
      TEXTPIC_DATA_OFFSET + STARTXTP0_BLOCK1,
      synthTextpic(),
      SCREEN_W,
      SCREEN_H,
    );
    // A black source pixel (index 0) must clear the star underneath (set/reset plane write semantics).
    // Source row 0 (synth index 1) lands somewhere in the band; the lip rows must be black, not 3.
    expect(out[139 * SCREEN_W + 10]).toBe(0); // 150 - 10 - 1 = top lip
  });

  it('use clamps 1 → 2 (the risetext `mov ax,2` floor)', () => {
    const a = new Uint8Array(SCREEN_W * SCREEN_H).fill(5);
    const b = new Uint8Array(SCREEN_W * SCREEN_H).fill(5);
    const tp = synthTextpic();
    compositeReveal(a, 1, TEXTPIC_DATA_OFFSET + STARTXTP0_BLOCK1, tp, SCREEN_W, SCREEN_H);
    compositeReveal(b, 2, TEXTPIC_DATA_OFFSET + STARTXTP0_BLOCK1, tp, SCREEN_W, SCREEN_H);
    expect(a).toEqual(b);
  });
});

# WATER (part #9) — fidelity fix STATUS (2026-06-19)

Branch `fix/water`, based on master `631778c`. Two visual-fidelity bugs fixed; the ray-traced mirror-ball
backdrop is unchanged (indices 0..191 of the palette are identical between the two candidate palettes — see
below — so the backdrop does not regress).

Original truth: `/home/sergey/SecondReality/WATER/ROUTINES.ASM` (the `Putrouts1` ripple+scroll blit) and
`WATER/DEMO.PAS` (the scene driver: palette load, scroll advance). Cross-checked against `WATER/TESTI.PAS`
(the standalone tester that reads the palette from `BKG.CLX`).

## Bug 1 — wrong palette for the scroller

`DEMO.PAS` sets the active VGA palette from the `_miekka` symbol, not from the background `BKG.CLX`:

```pascal
move(mem[seg(_miekka):ofs(_miekka)+10], pal, 768);     { 768-byte 6-bit DAC palette }
move(mem[seg(_miekka):ofs(_miekka)+778], font, 400*34); { the 400x34 scroll-font strip }
...
for x := 0 to 255 do setrgb(x, pal[x*3+0], pal[x*3+1], pal[x*3+2]);
```

`_miekka` is the RIX3 picture embedded in `MIEK.OBJ`; its 400x34 strip is what we ship as `FONT.CLX`
(`apps/lab/public/pics/water-font.clx`), and its header carries that `_miekka` palette **verbatim** (byte-
for-byte equal — verified). The port was instead taking `bgPic.palette` from `BKG.CLX`. The two palettes
share indices **0..191** (the mirror-ball backdrop) but differ for **192..255** (64 indices) — exactly the
ramp the scroll glyphs draw in. Result: the backdrop looked right, the scroller looked wrong.

Fix (`water.ts` `load`): use `fontPic.palette` (the `_miekka`/FONT.CLX palette) for the whole scene. Still
expanded 6-bit -> 8-bit (x4) under the sRGB-tagged LUT in `nodes.ts`, same as every other part. The
backdrop is unaffected because its indices (0..191) are identical in both palettes.

## Bug 2 — scroller leaked a frozen column and never terminated

`DEMO.PAS` scroll advance (run once per ripple-phase wrap, i.e. when `sss` hits 2):

```pascal
move(fbuf[1], fbuf, sizeof(fbuf));                    { shift the flat 158*34+1 buffer left 1 byte }
for x := 0 to 33 do fbuf[158 + x*158] := font[x*400 + scp];  { inject one 34-row font column }
if scp < 390 then inc(scp);                           { <-- the defect }
```

The `if scp < 390 then inc(scp)` clamps `scp` at 390 and then re-injects font column **390** (which has 4
ink pixels — confirmed) on *every* subsequent step, forever. On screen that is a frozen vertical strip of
glyph ink streaming across the water that never clears. The DOS demo only got away with it because the DIS
timeline ended the part (and faded the palette) before it mattered. The literal port reproduced the leak.

Fix (`scroller.ts`): bound the **source** index and drain instead of freezing.
- Walk `scp` across the *entire* message: `SCP_END = FONT_WIDTH = 400` (the clamp at 390 had also been
  dropping the last glyph columns 391..399 — 24 ink pixels — which now show).
- While `scp < SCP_END`, inject the real font column; once exhausted, inject **0** at every injection cell.
  Because the flat buffer shifts left one byte per step and the top byte is always cleared, injecting blanks
  drains the buffer to all-zero, and `composeWaterFrame` (which re-copies `tausta` every frame) then shows
  pure background — the scroller clears cleanly at the end of the text. Verified by simulation against the
  real `FONT.CLX`: 0 nonzero buffer cells after the drain.
- The blit (`Putrouts1`) bounds were already faithful (the `dx = 158*34` cell counter and per-cell
  `cx = count` inner loop in `ROUTINES.ASM`); this fix bounds the source feed, which is where the leak was.

Added `Scroller.finished` (true once `scp >= SCP_END`). `SCP_MAX` (the old 390 clamp constant) is removed.

## Tests

`scroller.test.ts` rewritten to assert: the message fully reveals (`scp` reaches `SCP_END == FONT_WIDTH`),
`scp` never advances past `SCP_END`, **beyond-end steps emit no ink** at any injection cell (no frozen-column
leak), and the buffer drains to all-zero after the message ends. Existing blit/picture/integration/wat-data
tests unchanged and still green.

## Verification

From repo root: `pnpm install`, `pnpm lint` (exit 0; the 2 warnings are pre-existing in `endpic/`, untouched),
`pnpm typecheck` (0), `pnpm test --testTimeout=60000` (630 passed / 118 files), `pnpm build` (ok). ciGreen.

## Left for a human (visual)

- Confirm the scroller glyph colours now read correctly against the mirror-ball backdrop (the 192..255 ramp).
- Confirm the message scrolls fully off and the water returns to clean background at the end (no trailing
  strip). The part is looped by the host; on loop it `reset()`s to an empty buffer at column 0.

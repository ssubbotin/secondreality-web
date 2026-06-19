# DDSTARS / "Desert Dream" stars (#10) — text/picture overlay reveal — STATUS

Date: 2026-06-19
Branch: `task/ddstars-overlay` (based on master `76a5f02`)
Scope: `packages/parts/src/ddstars/` (engine read-only); assets vendored into
`packages/parts/src/ddstars/__fixtures__/` + `apps/lab/public/pics/`.

## What was done

The procedural star field (part #10) was already faithful and is left untouched (all its tests still pass).
This change restores the previously-stubbed **"Desert Dream" text/picture overlay** that the original
overlays on a reveal schedule, ported verbatim from `DDSTARS/STARS.ASM` (`risetext` + the `do_stars`
schedule), the `DDSTARS/DOTEXTS.BAT` tool chain, and `GRAB/LBM16.C` / `UTIL/DOOBJ.C` (the asset format).

New files:

- `textpic.ts` / `textpic.test.ts` — decoder for `_textpic` (the `TEXTS.16` ".16"/".ux" container).
- `reveal.ts` / `reveal.test.ts` — the `risetext` reveal: schedule, open/close counters, curtain compositor.
- Wired into `ddstars.ts`: `load()` fetches `/pics/TEXTS.16`, the 70 Hz accumulator composites the reveal
  over each rendered star frame.

Vendored assets: `TEXTS.16` (the shipped `_textpic`) and `TEXTS.LBM` (its 256-colour source), into the
fixtures dir and `apps/lab/public/pics/`.

## The asset pipeline (so the decode is calibrated to the shipped truth)

`DDSTARS/DOTEXTS.BAT` is the recipe:

```
lbm16 texts.lbm texts.16 2          ; reduce TEXTS.LBM (PBM, 256-colour) to a 2-bitplane ".16" image
doobj  texts.16  _textpic _textpic.obk
```

- `TEXTS.LBM` is an IFF `PBM ` (chunky 8-bit), 320×200. It only ever uses palette indices 0..3.
- `GRAB/LBM16.C` (`savelinebuf`) emits the ".16"/".ux" container: a 16-byte header
  (`0xfcfc, xsz, ysz, colors, para-add, 0,0,0`), then `colors×3` **6-bit** palette bytes (the loader stored
  `getc()/4`), padded with `'X'` to `para-add×16` bytes, then pixels: per row, `bpls` (=2) bitplanes, each
  `xsz/8` bytes, MSB-first, plane `p` contributing bit `p`. For `colors=16`, `para-add = ceil((16+48)/16) =
  4`, so the **64-byte header** ends exactly at offset `0x40` — which is the `mov si,040h` `risetext` uses.
- `UTIL/DOOBJ.C` wraps the `.16` bytes **verbatim** into the linked-in `_textpic` symbol, so the bytes
  `risetext` reads from `_textpic` are byte-for-byte `TEXTS.16`. We therefore decode `TEXTS.16` directly
  (`decodeTextpic`).

`textpic.test.ts` cross-validates this: `decodeTextpic(TEXTS.16)` equals `decodeLbm(TEXTS.LBM).indices & 3`
with **zero** mismatches over all 64000 pixels, and pins a stable checksum (sum 25162, ink 12462).

## The reveal (`risetext`) — faithful port

`do_stars` increments `starframe` each tick and arms two text blocks (`@@st1`/`@@st2`):

- frame **1200** → block 1: `startxtp0 = 80` (source row 1), `startxtopen = -256`, `startxtclose = 1500`
- frame **3200** → block 2: `startxtp0 = 101*80 = 8080` (source row 101), counters re-armed

Both blocks live in the single 200-row `TEXTS.16` image (the credits scroller text at rows 1+, a second
block at rows 101+). Each tick `risetext`:

- `startxtopen += 1` (cap 99), `startxtclose -= 1` (floor 0), `startxtuse = min(open, close)`;
- if `use <= 0` nothing shows; `use == 1` is bumped to 2;
- draws a vertical curtain anchored at screen half-row `150 - use`: a black top "lip", a black row, then
  `use - 3` source rows copied from `_textpic` starting at `startxtp0/80`, then a black bottom lip. `di`
  advances 80 bytes = one screen row; the anchor is in the bottom (reflection) half so the text **rises out
  of the horizon** as `use` grows.

`reveal.ts` is a chunky-space re-expression of this: the original's mode-X plane writes only ever touch
plane 0 and plane 1 (`0102h`/`0202h`), copying 40 bytes/plane = one full 320-pixel row, so in chunky 8-bit
terms it is a per-row copy of the 2-bit `_textpic` indices framed by black lip rows. The
ASM `di` progression was simulated and the row geometry matches exactly (e.g. `use=5` → top-lip row 144,
black row 145, source-row-1 at row 146, bottom-lip row 147; `use=99` spans rows 50..147).

## The one fidelity decision (read this before "fixing" it)

**The final `STARS.ASM` has the text reveal effectively disabled, and we deliberately re-enable it.**

In `do_stars`, `risetext` runs *before* the star copy loops (`@@3`/`@@7`/`@@5`/`@@8`) that blit the star
accumulation pages into the back-buffer. Those loops are supposed to *skip* the text band via the
`_nostar1`/`_nostar2` clip (`cmp di,_nostar1 / jl @@3g / cmp di,_nostar2 / jg @@3g / jmp @@3s`) — which is
exactly what `STARS.OK` (the earlier single-buffer prototype) does, leaving the text visible. **In the final
`STARS.ASM` that clip is commented out**, so the star copies overwrite the whole back-buffer (200 rows),
erasing whatever `risetext` wrote. As shipped, that final build draws the reveal and then immediately
clobbers it — the machinery, the schedule, the two armed blocks, and the source art are all present and
intentional, but the last-minute disable hides the result. (The same `do_stars` even has dead code after its
`int 0fch` exit.)

The faithful restoration of the **intent** (and the documented "Desert Dream" credits the demo is known for)
is to make the reveal visible — i.e. honour the `_nostar` clip. We do the equivalent: composite the reveal
**after** the star raster each tick, so the star pixels in the text band are replaced by the text (and black
lips clear them), precisely the visible result the active `_nostar` clip produces in `STARS.OK`. This is the
one place we follow `STARS.OK`'s behaviour over the literal final-`STARS.ASM` byte stream; everything else
(schedule frames 1200/3200, `startxtp0` offsets, the open/close counters, the curtain geometry, the source
decode) is ported from the final `STARS.ASM`.

## Notes on POLYEGA.ASM / PIC*.EGA (cited, intentionally not used)

`POLYEGA.ASM` (the convex-polygon EGA filler) and `PIC.EGA`/`PIC2.EGA`/`DOIT*.C` are part of the DDSTARS
tree but **not** on the shipped text path: `STARS.ASM` `include`s `POLYEGA.ASM`, yet `do_stars` never calls
`poly`/`polyf` — the text wipe is the planar `risetext` copy above, and the polygon filler's only hook into
the copy loops (`_nostar1`/`_nostar2`) is the commented-out clip. `PIC*.EGA` are generated by `DOIT*.C` as
radial/striped EGA test pictures and are not referenced by `KOE.ASM`/`STARS.ASM` at all. They are documented
here for completeness; the overlay the demo shows is the `_textpic` reveal, which is fully restored.

## Verification

- `pnpm install`, `pnpm lint` (clean; the single warning is a pre-existing unused field in
  `engine/.../picture.ts`, not on this branch's diff), `pnpm typecheck`, `pnpm vitest run
  --testTimeout=60000` (656 tests pass, incl. the 16 new ddstars overlay tests and all pre-existing
  star-field tests), `pnpm build` — all green.
- Headless simulation of the wired update loop: at frame ~1600 (block 1 fully open, `use=99`) the green
  "Desert Dream" credits text renders over the reflection (rows 62..138); at frame ~3600 block 2 renders the
  second text. No vertical flip was introduced (the reveal writes `dst = row*W`, top-row-first, like the
  star raster).

## Citations

`DDSTARS/STARS.ASM` (`risetext`, `do_stars` `@@st1`/`@@st2`, the star copy loops + the commented `_nostar`
clip), `DDSTARS/STARS.OK` (the active `_nostar` clip that makes the reveal visible), `DDSTARS/KR.C`
(the DDSTARS part wrapper), `DDSTARS/POLYEGA.ASM` (`poly`/`polyf`/`hline1` — cited, off-path),
`DDSTARS/DOTEXTS.BAT`, `GRAB/LBM16.C` (`savelinebuf`/`.ux` format), `UTIL/DOOBJ.C` (verbatim `_textpic`
wrap).

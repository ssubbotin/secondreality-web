# Panic fake (PANIC) — design

Part #7 in the build order. Original: `/home/sergey/SecondReality/PANIC`
(`SHUTDOWN.C`, `TWEAK.ASM`, `ASMYT.ASM`). Builds `SD.EXE` → `MAIN/DATA/PANICEND.EXE`.

The "fake crash" gag: the demo flashes a hand-drawn MONSTER picture and then pretends the
machine crashes — the picture collapses vertically toward the screen centre, a horizontal
line wipes in from the edges, and a single bright dot pulses at the centre (the classic
"CRT shrinking to a line, then a dot, then off" look). It is all a joke; the demo continues.

## What the original does (cited)

### Assets
- `MONSTER.U` — **64000 bytes = 320×200 raw 8-bit VGA indices** (NOT the RLE `.U`/`.UH`
  picture format; `SHUTDOWN.C` does `read(fff,kuva,64000)` straight into a flat buffer).
  Index range observed: 0..127, 40 distinct values; index 0 is the black background
  (≈50% of pixels), the monster occupies indices ~100..127 plus a few.
- `MONSTER.PAL` — **768 bytes = 256 × 6-bit VGA RGB triples** (0..63). The picture's palette.
  `kuvapal[0..2] = (0,0,63)` (a blue index 0 in the file) but `SHUTDOWN.C` overrides colour 0
  to white during the crash; index 0 reads black on screen as drawn (the buffer's 0s are the
  background). We vendor MONSTER.PAL into `__fixtures__` and test the LUT byte-exactly.

### Display geometry (`TWEAK.ASM tw_opengraph`)
Mode 13h, chain-4 **off** (unchained / mode-X planar), CRTC retimed to a stretched display:
CRTC `0x14=0x00` (byte mode, not dword), `0x09=0x00` (max-scan 0), `0x13=0x50` (offset 80).
`tw_putpixel(x,y,c)` addresses `byte = (x>>2) + y*160`, `plane = x&3` — so one logical scan
line spans **160 planar bytes** and the picture is laid out in a 320-wide × 400-tall planar
field. `main()` draws the 320×200 picture at `(x+320, y*2)` and `(x+320, y*2+1)` — i.e. it
**doubles every source row vertically** and places it in the right half (x∈[320,640)) of the
planar field, with `tw_setstart(80)` scrolling the display so that half is shown.

For the web port we collapse this to a clean **320×200 logical index buffer** (the picture's
native resolution) and reproduce the *visible motion*, documenting the hardware mapping rather
than emulating VGA latches. The register pokes in `shutdown()` (`0x4109` CRTC, `0x4105`/`0x4005`
GC latch-copy modes, `0xa013` offset, map-mask) are the means by which the original does the
`copyline` block moves and the mid-screen scan-doubling jerk; their *effect* is the collapse we
model directly.

### The crash animation (`shutdown()`)
1. Build **64 fade palettes**: `fadepals[a][b] = (a*63 + kuvapal[b]*(64-a))/64`, a∈[0,64). a=0
   is the picture palette; rising a fades every colour toward 63 (white). C integer division.
2. Stage the picture: copy a **¼-height slice** of the picture (sampled `getpixel(x, y*4)`,
   y∈[0,100)) into the working region. The display is scrolled (`setstart(100*160)`).
3. `setpalette(fadepals[3])` (a faint white-wash), force colour 0 → white (63,63,63), wait.
4. `setpalette(fadepals[20])` + offset poke (`0xa013`) — a brighter wash + a shear jerk, wait.
5. **Collapse loop** `for(a=32; a>2; a = a*5/6)` — 11 iterations (32,26,21,17,14,11,9,7,5,4,3),
   each: wait a frame; `setpalette(fadepals[63-a])` (brightening 31→60 as a shrinks); then move
   blocks so the image folds symmetrically about the centre row (200 in the 400-tall field,
   = 100 in our 200-tall logical field): the top/bottom `a/2..a` bands are filled black and the
   picture is **resampled `400*b/a`** into the `a`-tall band straddling the centre. Net effect:
   the picture squashes into an ever-thinner horizontal band at the centre while flashing whiter.
6. Two more black copylines tighten the band to ±2 rows of centre.
7. **Horizontal wipe** `for(x=20; x<=160; x+=3)` — black out the centre row from both edges
   inward in 4-px-wide steps (47 frames), leaving a shrinking bright segment = the "scan line".
8. **Pulsing dot**: plot one pixel white at the centre; `for(a=0; a<60; a++)` set colour 1 to
   `cos(a/120·3·2π)·31+32` grey — **1.5 cosine periods over 60 frames** → the dot brightens and
   dims (≈3 pulses) then `sleep(1)`. This is the final "dot fading out".

### Timing
Every step is gated by `dis_waitb()` = one vertical-blank = one frame at the demo's 70 Hz
mode-X cadence. So the whole gag is frame-counted, not music-synced. Frame budget:
2 (palette washes) + 11 (collapse) + 47 (wipe) + 60 (dot) ≈ **120 frames ≈ 1.7 s**, then a
1 s hold. We reproduce it on a fixed-timestep accumulator at `SIM_HZ = 70`.

## Authentic vs modern
- **authentic**: 320×200 index buffer → MONSTER palette LUT → `NearestFilter` chunky upscale.
- **modern**: same buffer/LUT → `LinearFilter` smooth upscale. Mode-X pixel-aspect correction
  (4:3) is applied by the host as for the other parts.
Both render the identical CPU raster; only the upscale filter differs (the dot-tunnel approach).

## Plan
- `palette.ts` — load/keep the 256×3 6-bit MONSTER palette; `paletteLut` → sRGB bytes (×4).
  Vendor `MONSTER.PAL` to `__fixtures__`, assert byte-exact.
- `picture.ts` — wrap the 64000-byte MONSTER.U buffer (the raw 320×200 indices). Fixtures + size test.
- `crash.ts` — the **pure** crash simulation: `createCrashState()`, `stepCrash(state)` advancing one
  frame, and `rasterCrash(out, state, picture)` writing the 320×200 index buffer. Models steps 2–8
  above (fade level, collapse band height, wipe extent, dot brightness) as plain state; unit-tested
  for the documented frame counts, band collapse, wipe progression, and dot pulse.
- `nodes.ts` — `CrashSurface`: index buffer + palette LUT → sRGB `DataTexture` → `Blit` (row-flipped,
  `SRGBColorSpace`-tagged), `setFilter()` for authentic/modern. Mirrors dot-tunnel `RasterSurface`.
- `panic.ts` — the `Effect`: async `load()` fetches `/pics/MONSTER.U` + `/pics/MONSTER.PAL`,
  `init()` allocates the surface, fixed-step `update()` advances the crash, `render()` blits into
  the supplied target. `setMode('authentic'|'modern')`.

Ship `MONSTER.U` and `MONSTER.PAL` raw to `apps/lab/public/pics/`.

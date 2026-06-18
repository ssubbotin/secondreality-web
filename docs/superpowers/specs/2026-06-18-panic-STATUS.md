# Panic fake (PANIC) — STATUS

Part #7. Branch `build/16-panic`. Original: `/home/sergey/SecondReality/PANIC`
(`SHUTDOWN.C`, `TWEAK.ASM`, `ASMYT.ASM`).

## State: shipped, CI-green, un-wired

Lint, typecheck, test (123 passed), and build all pass. The part is **not** wired into
`packages/parts/src/index.ts` or the lab (those were out of scope — DO NOT TOUCH). To run it
locally, add `export { Panic } from './panic/panic.js';` to the parts barrel and register it in
the lab; it self-loops the gag.

## Files added
- `apps/lab/public/pics/MONSTER.U` (64000 B raw 320×200 indices), `MONSTER.PAL` (768 B 6-bit VGA).
- `packages/parts/src/panic/__fixtures__/MONSTER.U`, `MONSTER.PAL` (vendored for byte-exact tests).
- `packages/parts/src/panic/picture.ts` (+`.test.ts`) — the raw 320×200 index buffer.
- `packages/parts/src/panic/palette.ts` (+`.test.ts`) — VGA palette parse, sRGB LUT, `fadeVgaPalette`.
- `packages/parts/src/panic/crash.ts` (+`.test.ts`) — the pure crash simulation + raster.
- `packages/parts/src/panic/nodes.ts` — `CrashSurface` (index→faded-LUT→sRGB DataTexture blit).
- `packages/parts/src/panic/panic.ts` — the `Effect`.
- `docs/superpowers/specs/2026-06-18-panic-design.md`, `docs/superpowers/plans/2026-06-18-panic.md`.

## Hard-won fidelity findings
- **MONSTER.U is NOT the RLE `.U`/`.UH` picture format.** It is a flat 64000-byte raw 320×200
  8-bit index buffer — `SHUTDOWN.C` does `read(fff,kuva,64000)` straight into memory and pushes
  `MONSTER.PAL` to the DAC. The shared `loadPicture`/`decodePicture` engine API referenced by the
  task brief does not exist on this branch (the picture pipeline wave hadn't landed at this HEAD),
  so the part decodes the raw buffer + palette itself (no engine changes — `packages/engine/**`
  untouched). If/when the engine picture API lands, MONSTER.U should be served raw and decoded as a
  raw buffer (it is not RLE), not run through the RLE decoder.
- **Palette header:** MONSTER.PAL index 0 = (0,0,0) black, index 1 = (63,63,63) white. The picture's
  background is index 0 (≈50% of pixels). `SHUTDOWN.C` overrides colour 0 to white *during* the
  flash, but the visible background stays black (the buffer holds 0s that read black); we pin index 0
  black in `fadeVgaPalette` so the flash doesn't wash the whole screen white. The pulsing dot is
  palette index 1.
- **Tag the LUT `SRGBColorSpace`** (×4 6-bit→8-bit) so the VGA DAC bytes land verbatim — same
  load-bearing finding as the other index-buffer parts.
- **The crash is frame-counted, not music-synced** (every step is one `dis_waitb`). Reproduced on the
  fixed-timestep accumulator at `SIM_HZ = 70`. Frame budget: 2 wash + 11 collapse + 47 wipe + 60 dot
  = 120 frames (~1.7 s) + a ~1 s hold (`sleep(1)`), then the gag self-loops in the lab.
- **C integer truncation matches exactly**: the collapse step `a=a*5/6` → {32,26,21,17,14,11,9,7,5,4,3};
  the fade `(a*63+pal*(64-a))/64`; the band-half `a/2`; the dot `cos(a/120·3·2π)·31+32` — all
  `Math.trunc`, asserted in the unit tests.

## Approximations (documented)
- The original drives a **stretched 640×400 planar VGA field** (centre row 200) with chain-4-off
  latch-copy block moves and CRTC/GC register pokes; the picture is drawn `(x+320, y*2/y*2+1)` (row-
  doubled into the right half) and the collapse is `copyline` memory moves with `400*b/a` resampling
  plus a mid-screen offset/scan-double "jerk". We model the **visible motion** in the picture's native
  **320×200 logical field** (centre row 100): the picture is squashed into a band of half-height `a/2`
  brightening toward white, then a centre-line wipe (`x:20→158 step 3`), then the pulsing centre dot.
  The collapse uses a linear band→full-height resample (vs the original's `400*b/a` fold); the result
  is the same shrinking-bright-line read. The register-level jerk/shear is not emulated (it is the
  mechanism, not an independently visible element). If a closer match to the fold is wanted, swap the
  band resample in `rasterCrash` for the explicit `400*b/a` mapping in 400-space and downsample.

## Verification
- Rendered MONSTER.U through MONSTER.PAL offscreen: the iconic green-fanged demon face decodes
  correctly; a mid-collapse frame shows the image squashed to a thin white-washed band at the centre,
  confirming the palette, index buffer, fade, and collapse geometry.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.

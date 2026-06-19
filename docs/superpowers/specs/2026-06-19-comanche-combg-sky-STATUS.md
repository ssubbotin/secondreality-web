# COMANCHE / 3D sinus field (part #17) — COMBG sky backdrop STATUS (2026-06-19)

Branch `comp/comanche-combg`, based on master `22bec5b`. Restores the deferred **COMBG sky backdrop** that
the terrain rasters in front of: the sky used to clear to black (palette 0); it now shows the COMBG
dark-blue→light-blue horizon ramp, with the voxel terrain compositing on top exactly as the original
`_docopy` did. No regression to the spike/shade/orientation fixes (`raster.ts` `rasterColumn` is untouched).

## Original truth

- `COMAN/MAIN.C` — `main()` builds the palette and then folds in the COMBG band + de-interleaves the COMBG
  body into `combguse[]`; `doit()` runs the camera/column loop and calls `docopy`.
- `COMAN/ASM.ASM` `_docopy` — blits the COMBG sky (`combguse`, the `IFDEF PXLSUX` block) then composites the
  terrain (`vbuf`) over it.
- `COMAN/DOPIC.BAT` — `lbm2u combg.lbm combg.uh` then `doobj combg.uh _combg` (the linked `extern char
  combg[]`).
- `GRAB/LBM2U.C` — the `.ux` writer that defines the `combg[]` byte layout MAIN.C reads.
- `COMAN/COMBG.LBM` — the actual sky picture (IFF `PBM ` chunky, 320×90, 256 colours). **This is the truth.**

### How `combg[]` is laid out (lbm2u `.ux` format)

```
word 0  0xfcfc   word 1 xsz(320)  word 2 ysz(90)  word 3 colors(256)
word 4  para-add = (16 + colors*3 + 15)/16 = 49  → body at byte 49*16 = 784 = 768 + 16
bytes 16..783   palette: colors*3 bytes, each a 6-bit VGA component (lbm2u: `getc(f1)/4`)
bytes 784..     body: ysz rows × xsz chunky 8-bit indices
```

MAIN.C reads it:
- **palette band:** `for(x=720;x<768;x++) palette[x]=combg[16+x];` → colour indices 240..255 become the
  COMBG 6-bit palette (the horizon ramp).
- **backdrop body:** `combguse[x+y*160]=combg[x*4+y*320+784]` (planes 0/1) and
  `combguse[x+80+y*160]=combg[x*4+2+y*320+784]` (planes 2/3). `_docopy` then blits `combguse[bc]` to planes
  0+1 and `combguse[bc+80]` to planes 2+3 — the screen pixel-doubles, so the **effective 160-wide backdrop
  samples the even chunky columns** (field col `a` ↔ chunky col `2a`), one COMBG row per screen row.

### Why the sky was black in the literal 1993 binary (and why we use COMBG.LBM anyway)

The `COMAN/COMBG.UH` and `COMAN/_COMBG.OBK` checked into the original tree are a **stale artifact of an older
"UH" converter** (the obj wraps a `UH\01\00`, 320×200 header, not the `0xfcfc` lbm2u layout). Its palette
band (bytes 736..783) and body (bytes 784..) are zero/misaligned; the real pixels sit at offset 18896. So
the symbol the linker actually resolved gave `palette[240..255]=0` (black) and a blank body — the released
build's sky degenerated to black. `COMBG.LBM` is the authored source and `lbm2u`+MAIN.C define the intended
mapping; this port reproduces that intent from the LBM (the task brief and the part's own recipe call for
exactly this). The pre-existing palette path matched the buggy black band; that fallback is preserved.

## Changes (all within `packages/parts/src/comanche/` + vendored assets)

- **`combg.ts` (new)** — `decodeCombg(buffer)` runs the engine `decodeLbm`, then yields:
  - `paletteBand`: 48 bytes (16 colours × 6-bit RGB) for indices 240..255, read off `decodeLbm`'s
    `palette6` (= `palette8 >> 2`, identical to lbm2u's `getc/4` truncation).
  - `body`: a FIELD_W(160) × COMBG_H(90) screen-order index buffer; field col `a` ← chunky col `2a` (the
    even-column pixel-doubling the mode-X `combuse` blit performs), one COMBG row per screen row.
- **`palette.ts`** — `buildComanchePalette(paletteBand?)`: when a band is supplied, indices 240..255 get it
  (MAIN.C `palette[x]=combg[16+x]`); omit it and the band stays black (the math-only unit-test path).
- **`raster.ts`** — `rasterField(..., backdrop?)`: lays the COMBG body into the sky rows first (rows 0..89;
  the rest stay sky-black), then casts the terrain rays ON TOP — the ray only writes the cells it hits, so
  the terrain overwrites the sky where it rises and the backdrop shows through above the horizon, matching
  `_docopy` (sky blit, then terrain blit). `rasterColumn` (the THELOOP register emulation) is unchanged.
- **`comanche.ts`** — `load()` fetches `/pics/COMBG.LBM`, `decodeCombg`s it, rebuilds the palette with the
  band, and `update()` passes `backdrop.body` to `rasterField`. The DataTexture is still tagged
  `SRGBColorSpace` (the 6-bit→8-bit ×4 bytes land verbatim), so the new 240..255 colours are correct.
- **Assets** — `COMBG.LBM` vendored into `packages/parts/src/comanche/__fixtures__/` (for the offline tests)
  and `apps/lab/public/pics/` (served at `/pics/COMBG.LBM`; the build copies it to `dist/pics/`).

## Tests

- **`combg.test.ts` (new)** — palette band == independent Python-derived golden (the dark→light blue ramp,
  blue dominant + monotonically rising); body is black for rows 0..58 and the contiguous 225..255 ramp for
  rows 59..89; body is exactly FIELD_W wide; the band fed through `buildComanchePalette` lands verbatim in
  240..255; and the no-band fallback leaves 240..255 black. The goldens were derived from a from-scratch
  ByteRun1 + CMAP decode of COMBG.LBM, **not** from `decodeCombg`.
- **`raster.test.ts`** — two new cases: the backdrop fills the sky and survives where the ray never hits
  while the terrain overwrites the bottom rows; and the no-backdrop path still clears the sky to 0.
- The existing oracle/spike/shade/orientation tests are untouched and still pass.

## Gates (all green)

`pnpm install`, `pnpm lint` (exit 0; one pre-existing non-fatal warning in the untouched
`packages/parts/src/panic/picture.ts`), `pnpm typecheck`, `pnpm vitest run --testTimeout=60000` (620 tests),
`pnpm build` — all green.

## Notes for the next hand

- A human must verify visually: the sky should be a dark-blue band at the top fading to a lighter
  blue/horizon glow just above the terrain silhouette, with the depth-shaded terrain in front. Check both
  the authentic (chunky `NearestFilter`) and modern (`LinearFilter`) toggles and both backends.
- The original's `_docopy` only blits 60 sky rows (PXLSUX, and it was compiled out in the shipped build);
  this port fills all 90 COMBG rows behind the terrain. Visually equivalent above the horizon (the terrain
  covers the lower rows); revisit if a future composite needs the exact 60-row clip.

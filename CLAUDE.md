# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A modern web port of Future Crew's *Second Reality* (Assembly'93). Fidelity target: **"faithful core +
modern polish"** — original choreography, the original `.S3M` soundtrack, every effect recognizable, but
rendered sharp at high resolution and 60fps+ with an authentic↔modern toggle.

- **Design spec:** `docs/superpowers/specs/2026-06-13-secondreality-web-stack-design.md` (read this first).
- **Per-effect plans & status:** `docs/superpowers/plans/*` (the build order) and
  `docs/superpowers/specs/*-STATUS.md` (handoff notes for the effect in flight — read the relevant one
  before touching a part).
- **Original 1993 source:** `/home/sergey/SecondReality` (read its `CLAUDE.md` for the DOS-era architecture:
  the DIS runtime, ~20 effect "parts", S3M music, the asset formats). Effects are ported **verbatim** from
  the matching original directory (e.g. `TECHNO/KOE.C`, `KOEA.ASM`) — that source is the truth.

## Commands

```bash
pnpm install              # bootstrap the workspace
pnpm dev                  # build the worklet, then run the lab at http://localhost:5180
pnpm build                # build:worklet → build every package → build the lab (what CI runs)
pnpm build:worklet        # regenerate the audio worklet bundle (see below) — rerun after editing its sources
pnpm typecheck            # tsc -b across all project references
pnpm lint                 # biome check .   (lint:fix to autofix + format)
pnpm test                 # vitest run (all *.test.ts under packages/**)
pnpm test:watch           # vitest in watch mode
```

Run a single test file or test by name (vitest):

```bash
pnpm vitest run packages/engine/src/sync/reconstruct.test.ts
pnpm vitest run -t 'computeMusplus'
```

CI (`.github/workflows/ci.yml`) gates merges on: `lint` → `typecheck` → `test` → `build`. Keep all four
green. Node ≥ 20.11, pnpm 10.

**`build:worklet` is codegen you must not skip.** `scripts/build-worklet.mjs` concatenates the libopenmpt
WASM glue (`packages/engine/src/audio/libopenmpt.glue.js`) with the AudioWorkletProcessor
(`player-worklet.js`) into `apps/lab/public/worklets/player-worklet.js` — stripping the glue's ESM
`export`/`import.meta` (illegal in a classic worklet). The output is **gitignored**, so a fresh checkout has
no worklet until you run `pnpm dev`/`pnpm build`/`pnpm build:worklet`. Editing either audio source means
rerunning it.

## Architecture

A pnpm workspace monorepo. **As built today** (the spec describes the full 20-part target; only these exist
so far):

- **`packages/engine`** (`@sr/engine`) — the owned runtime: renderer, audio master clock, four-channel music
  sync, the `Effect` ABI, math. No effect logic.
- **`packages/parts`** (`@sr/parts`) — the demo effects. Currently just `techno-bars/` (the first part).
- **`apps/lab`** (`@sr/lab`) — a Vite host that mounts **one** `Effect` for development. (The full sequenced
  demo app, `apps/demo`, and the asset pipeline are future work per the spec.)

Engine source is consumed as raw TypeScript (`main`/`exports` point at `src/index.ts`), so editing engine
code is picked up by the lab with no separate build during `pnpm dev`.

### The master clock (audio drives everything)

The audio **is** the timeline; effects never time off raw `requestAnimationFrame` deltas. The chain:

1. **`AudioWorkletNode('sr-player')`** runs libopenmpt (WASM) in an AudioWorklet and posts `pos` reports
   (songSeconds + order/row/pattern/bpm at a known `contextTime`) back to the main thread.
2. **`AudioClock`** (`audio/clock.ts`) stores the latest report and linearly extrapolates `songSeconds`
   between reports (slope 1 — the context plays in real time), correcting for `outputLatency` and a
   user-tunable A/V offset. Re-anchoring every report keeps the extrapolation window to a few ms.
3. **`AudioEngine.sample()`** (`audio/audio-engine.ts`) is called once per frame for a `ClockSample`.
4. **`MusicSync.resolve()`** (`sync/music-sync.ts`) turns that base sample into the full **four-channel
   `MusicClock`** the original DIS runtime exposed: `muscode`/`musplus`/`musrow`/`mframe`. These are
   **reconstructed**, not read from the player — `sync/reconstruct.ts` reproduces DIS `muscode_6`'s clamped
   signed `musplus` countdown and `sync/mframe.ts` the tempo-driven (`BPM*2/5` Hz) song-tick counter.
   Parts poll these exactly as the original ASM did (e.g. TECHNO gates on `musrow & 7` and `musplus`).

The S3M modules in `apps/lab/public/music/` are Future Crew's **obfuscated STMIK files**;
`deobfuscateS3M()` (`audio/stmik-module.ts`) un-obfuscates them into standard S3M before libopenmpt parses.

### The `Effect` ABI (the modern, frozen `DIS.H`)

`packages/engine/src/types.ts` defines the one interface every part implements. Lifecycle mirrors the
original `dis_partstart` / `do{…; dis_waitb();}while(!dis_exit())` loop, but split for the web:

- `load(LoadContext)` — **async** asset fetch/decode; runs *during the previous part* (no load stall).
- `init(DemoContext)` — sync GPU allocation sized to the viewport.
- `update(FrameContext)` — advance simulation from `frame.clock` (the music time source); **no drawing**.
- `render(frame, RenderTarget)` — draw into the **supplied** target (so the host can composite/cross-fade
  two live effects), never straight to the canvas.
- `resize(w, h)` / `dispose()` — recreate resolution-dependent targets / free GPU resources.

The lab host (`apps/lab/src/run-effect.ts`) drives this loop for a single effect and `Blit`s the effect's
off-screen `RenderTarget` to the canvas. It returns a teardown closure wired to `import.meta.hot.dispose`
so HMR reloads don't accumulate orphaned RAF loops / render targets / listeners — **preserve that teardown
discipline** when changing the host.

### Rendering

`three/webgpu` + **TSL** (Three Shader Language: author a node graph once → WGSL on WebGPU, GLSL on WebGL2).
**WebGPU and WebGL2 are co-primary, not fallback** — `createRenderer` (`render/renderer.ts`) picks via
`selectBackend()` (WebGL2 on Safari unless opted in) and forces it through `WebGPURenderer.forceWebGL`. The
lab accepts `?backend=webgl2` / `?backend=webgpu` to override. A single `onDeviceLost` hook covers both
backends.

### How a part is structured (TECHNO as the template)

`packages/parts/src/techno-bars/` separates **pure, unit-tested logic** from **GPU nodes**:

- `sin1024.ts`, `geometry.ts`, `phase.ts`, `palette.ts` — pure functions ported verbatim from the original
  (`KOE.C`/`SIN1024.INC`), each with a `*.test.ts`. **Test the math here, not through the GPU.**
- `nodes.ts` — the TSL/Three GPU pieces (`BarLayer`, `PlaneStack`, `PaletteResolve`).
- `techno-bars.ts` — the `Effect` implementation tying them together. Uses a **fixed-timestep accumulator**
  (`SIM_HZ = 70`, the original mode-X cadence) so motion speed is display-fps-independent; the authentic
  look renders at chunky mode-X internal resolution (`NearestFilter`), modern at full viewport
  (`LinearFilter`), toggled by `setMode()`.

When porting the next part, follow this split. The STATUS doc for an effect records hard-won fidelity
findings (e.g. the palette LUT must be tagged `SRGBColorSpace` so VGA DAC bytes land verbatim) — read it.

## Conventions

- **License:** public domain (**Unlicense**), same as the original. Ship an `UNLICENSE` file.
- **TypeScript:** strict, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`. Use explicit `.js` extensions on relative imports (NodeNext/bundler + ESM).
- **Formatting/lint:** Biome (2-space, single quotes, semicolons, width 100). `libopenmpt.glue.js` is
  excluded — don't reformat the vendored glue.
- **Git identity:** commits use `Sergey Subbotin <ssubbotin@gmail.com>`.
- **Commit attribution:** this repo **DOES** include the Claude co-author trailer on commits
  (`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`). This is a deliberate per-repo
  override of the global "no AI attribution" rule — **do not strip it here.**
- **Decisions locked (2026-06-13):** all 20 parts; authentic↔modern toggle defaulting to modern 16:9
  (mode-X pixel-aspect correction always on); desktop-first, mobile must-not-crash; default-loop playback.

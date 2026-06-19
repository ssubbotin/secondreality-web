# Second Reality — Web

A modern web port of Future Crew's **Second Reality** (Assembly'93), the most celebrated PC demo of the
DOS era. The goal is **"faithful core + modern polish"**: the original choreography and the actual `.S3M`
soundtrack, every effect recognizable, but rendered sharp at high resolution and 60fps+ with a runtime
**authentic ↔ modern** toggle.

Built on TypeScript (strict) · Three.js (`three/webgpu` + TSL, WebGL2 co-primary) · libopenmpt in an
AudioWorklet as the master clock · Vite (Rolldown) · pnpm workspace.

**▶ Live demo — [secondreality-web.surge.sh](https://secondreality-web.surge.sh)**
(single-effect preview: Techno bars — press ▶ play to start the audio-driven clock).

> **Status: foundation complete, 18 of 20 effects shipped.** The runtime spine — renderer, the libopenmpt
> master clock, the four-channel music-sync reconstruction, and the typed `Effect` ABI — is in place, as are
> the asset pipelines (`.U`/`.UH` and ILBM `.LBM` VGA-picture decoders plus a bitmap-font text layer).
> Eighteen of the twenty effects are faithful and merged; only the two baked 3D vector scenes (Vector Part I
> — Space battle, and Vector Part II — KewlComplex city) remain, pending a 3D-model/animation extraction
> step.

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5180  (the lab host: mounts one effect)
```

Other commands: `pnpm build` (full build, what CI runs) · `pnpm typecheck` · `pnpm lint` · `pnpm test`.
Append `?backend=webgl2` or `?backend=webgpu` to the lab URL to force a renderer backend. Requires Node ≥ 20.11
and pnpm 10. See [`CLAUDE.md`](./CLAUDE.md) for the architecture and contributor notes.

## The 20 parts

The running order and titles below are the canonical sequence from the original `MAIN/PARTS`. Each effect is
ported verbatim from its source directory in the original release.

Legend: ✅ shipped & faithful · 🚧 in progress · ⬜ planned

| # | Part | Original | Rendering technique | State |
|--:|------|----------|---------------------|:-----:|
| 1 | **Opening texts I** | `ALKU` | Bitmap-font text reveal over a copper backdrop | ✅ |
| 2 | **Opening texts II** | `ALKU` | Horizontal credit scroller over a panning copper backdrop | ✅ |
| 3 | **Opening texts III** | `ALKU` | Final picture reveal — ILBM flashes + copper fade | ✅ |
| 4 | **Glenz vectors** | `GLENZ` | Real-time additive "glenz" solids over a copper-bar palette (CPU raster) | ✅ |
| 5 | **Dot tunnel** | `TUNNELI` | Concentric dot rings receding on a sine-driven delayed-camera path (CPU raster) | ✅ |
| 6 | **Techno bars** | `TECHNO` | Fullscreen raster — rotated-coordinate interference + plane accumulation | ✅ |
| 7 | **Panic fake** | `PANIC` | Fake-crash gag — picture wash / collapse / wipe (frame-counted) | ✅ |
| 8 | Vector Part I — Space battle | `VISU → U2A` | Baked 3D vector scene (glTF + animation track) | ⬜ |
| 9 | **Mirror-ball water scroll** | `WATER` | Raytraced background + per-scanline water ripple + scroller | ✅ |
| 10 | **Desert Dream stars** | `DDSTARS` | Procedural 3D star field — reciprocal-depth projection, depth-banded brightness, delayed mirror | ✅ |
| 11 | **Lens** | `LENS` | Per-pixel magnifying-lens displacement of a VGA picture | ✅ |
| 12 | **Rotozoomer** | `LENS` | Affine warp (rotation + zoom) of a tiling picture | ✅ |
| 13 | **Plasma** | `PLZPART` | Fullscreen raster — diagonal summed sine-table field + k/l interlace + animated palette | ✅ |
| 14 | **Plasmacube** | `PLZPART` | Texture-mapped rotating cube (sine-tile faces, affine CPU raster) | ✅ |
| 15 | **MiniVectorBalls** | `DOTS` | Procedural ball fountain — fixed-point phase machine, gravity + bounce | ✅ |
| 16 | **Mountain scroller** | `FOREST` | Parallax bitmap scroll (ILBM layers + scroll-path data) | ✅ |
| 17 | **3D Sinus field ("Comanche")** | `COMAN` | Forward voxel-terrain raster over a sine-driven heightfield | ✅ |
| 18 | Vector Part II — KewlComplex city | `VISU → U2E` | Baked 3D vector scene (glTF + animation track) | ⬜ |
| 19 | **End picture flash** | `ENDPIC` | White-flash fade into a decoded VGA title picture (`.U`/RLE pipeline) | ✅ |
| 20 | **Credits / greetings scroll** | `CREDITS` / `ENDSCRL` | Bitmap-font vertical text scroller (`ENDSCROL.TXT`) | ✅ |

**18 / 20 shipped.** The five rendering technique classes (fullscreen raster, feedback/ping-pong, real-time
3D vector, particle/dot systems, 2D scrollers) are detailed in the design spec under
`docs/superpowers/specs/`.

## How it works

The audio **is** the timeline. libopenmpt plays the original (de-obfuscated) `.S3M` modules in an
AudioWorklet and reports song position; the engine extrapolates a continuous clock and reconstructs the
original DIS runtime's four-channel music sync (`muscode` / `musplus` / `musrow` / `mframe`) that the effects
busy-wait on, exactly as the 1993 ASM did. Every part implements one typed `Effect` interface (the modern,
frozen `DIS.H`): `load` → `init` → `update` → `render` → `dispose`. Full detail in [`CLAUDE.md`](./CLAUDE.md)
and the design spec.

## Project layout

```
packages/engine   @sr/engine  — renderer, audio master clock, four-channel sync, Effect ABI, math, the
                                picture asset pipeline (.U/.UH + ILBM decoders + loader) in src/assets,
                                and the bitmap-font text layer in src/text
packages/parts    @sr/parts   — the demo effects (alku1, alku2, alku3, glenz, dot-tunnel, techno-bars,
                                panic, ddstars, lens, rotozoomer, plasma, plasmacube, minivectorballs,
                                forest, comanche, water, credits, endpic)
apps/lab          @sr/lab     — Vite host that mounts a single effect for development
docs/superpowers  design spec, per-effect plans, and handoff/status notes
```

## License

Public domain — released under the [Unlicense](./UNLICENSE), the same terms as the original 1993 sources.

## Credits

Second Reality is the work of **Future Crew** (1993). This is an unaffiliated, fan-made web port that reuses
the original assets and choreography. All respect to the original authors.

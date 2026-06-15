# Second Reality — Web

A modern web port of Future Crew's **Second Reality** (Assembly'93), the most celebrated PC demo of the
DOS era. The goal is **"faithful core + modern polish"**: the original choreography and the actual `.S3M`
soundtrack, every effect recognizable, but rendered sharp at high resolution and 60fps+ with a runtime
**authentic ↔ modern** toggle.

Built on TypeScript (strict) · Three.js (`three/webgpu` + TSL, WebGL2 co-primary) · libopenmpt in an
AudioWorklet as the master clock · Vite (Rolldown) · pnpm workspace.

**▶ Live demo — [secondreality-web.surge.sh](https://secondreality-web.surge.sh)**
(single-effect preview: Techno bars — press ▶ play to start the audio-driven clock).

> **Status: foundation complete, 2 of 20 effects shipped.** The runtime spine — renderer, the libopenmpt
> master clock, the four-channel music-sync reconstruction, and the typed `Effect` ABI — is in place and the
> first two effects (Techno bars, Plasma) are faithful and merged. The remaining 18 parts are being ported
> one at a time.

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
| 1 | Opening texts I | `ALKU` | 2D text / picture flash | ⬜ |
| 2 | Opening texts II | `ALKU` | 2D text / picture flash | ⬜ |
| 3 | Opening texts III | `ALKU` | 2D text / picture flash | ⬜ |
| 4 | Glenz vectors | `GLENZ` | Real-time 3D vectors, additive + per-scanline copper palette | ⬜ |
| 5 | Dot tunnel | `TUNNELI` | Particle / feedback trails | ⬜ |
| 6 | **Techno bars** | `TECHNO` | Fullscreen raster — rotated-coordinate interference + plane accumulation | ✅ |
| 7 | Panic fake | `PANIC` | Picture flash / fake reboot | ⬜ |
| 8 | Vector Part I — Space battle | `VISU → U2A` | Baked 3D vector scene (glTF + animation track) | ⬜ |
| 9 | Mirror-ball water scroll | `WATER` | 2D scroller + raytraced background + per-scanline ripple | ⬜ |
| 10 | Desert Dream stars | `DDSTARS` | Particle star field | ⬜ |
| 11 | Lens | `LENS` | Per-pixel displacement (baked displacement texture) | ⬜ |
| 12 | Rotozoomer | `LENS` | Affine UV warp + self-feedback | ⬜ |
| 13 | **Plasma** | `PLZPART` | Fullscreen raster — diagonal summed sine-table field + k/l interlace + animated palette | ✅ |
| 14 | Plasmacube | `PLZPART` | Fullscreen raster plasma on a cube | ⬜ |
| 15 | MiniVectorBalls | `DOTS` | Particle / instanced dot balls | ⬜ |
| 16 | Mountain scroller | `FOREST` | 2D bitmap scroller | ⬜ |
| 17 | 3D Sinus field ("Comanche") | `COMAN` | Heightfield raymarch — hand-written WGSL/GLSL | ⬜ |
| 18 | Vector Part II — KewlComplex city | `VISU → U2E` | Baked 3D vector scene (glTF + animation track) | ⬜ |
| 19 | End picture flash | `ENDPIC` | Picture flash | ⬜ |
| 20 | Credits / greetings scroll | `CREDITS` / `ENDSCRL` | 2D scroller | ⬜ |

**2 / 20 shipped.** The five rendering technique classes (fullscreen raster, feedback/ping-pong, real-time
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
packages/engine   @sr/engine  — renderer, audio master clock, four-channel sync, Effect ABI, math
packages/parts    @sr/parts   — the demo effects (currently: techno-bars)
apps/lab          @sr/lab     — Vite host that mounts a single effect for development
docs/superpowers  design spec, per-effect plans, and handoff/status notes
```

## License

Public domain — released under the [Unlicense](./UNLICENSE), the same terms as the original 1993 sources.

## Credits

Second Reality is the work of **Future Crew** (1993). This is an unaffiliated, fan-made web port that reuses
the original assets and choreography. All respect to the original authors.

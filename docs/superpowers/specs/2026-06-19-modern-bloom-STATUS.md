# Modern bloom / glow post-process STATUS (2026-06-19)

Branch `feat/modern-bloom`, based on `193a7ab`. Adds a reusable, cross-backend bloom/glow post-process
to `@sr/engine` and wires it into the **modern** toggle of the five glow/additive parts. Authentic mode
and every non-target part are byte-for-byte unchanged.

Before this, the authentic↔modern toggle was *only* `NearestFilter` vs `LinearFilter` on the CPU-raster
output — modern looked like a smoother version of the same chunky frame. Now modern adds a true
bright-pass → blur → additive-composite glow on top of the smooth upscale, so lit dots / plasma crests /
glass-solid edges bloom.

## What shipped

- `packages/engine/src/render/bloom-math.ts` — pure, unit-tested math (no GPU types):
  - `gaussianWeights(radius, sigma=radius/2)` — one-sided Gaussian weights.
  - `blurKernel(radius, sigma)` — full symmetric, **normalised-to-1** separable tap list (offset+weight).
  - `brightPass(value, threshold, knee)` — the soft-knee threshold response (smoothstep in the knee band),
    the CPU reference for the TSL bright pass.
  - Tests: `bloom-math.test.ts` (9 tests) — peak/falloff/monotonicity, kernel symmetry + sum==1, knee ramp.
- `packages/engine/src/render/bloom.ts`:
  - `BloomPass` — the post chain. Ergonomics mirror `Blit`: `setSource(tex)`, `render(renderer, target)`,
    `setStrength`, `setThreshold(threshold, knee)`, `resize(w,h)`, `dispose()`.
  - `BloomComposite` — the thin shared helper the parts actually call. Owns a full-res scratch target +
    a `BloomPass`; `render(renderer, output, draw)` runs `draw(renderer, scratch)` (the part's existing
    `surface.render`) then composites the glow into `output`.
  - Tests: `bloom.test.ts` (11 tests) — RT allocation/resize-idempotence/dispose lifecycle for both
    classes (the node test env constructs `three/webgpu` `RenderTarget`s fine; only `render` needs a live
    GPU, which is human-verified).

## Pipeline (all fullscreen QuadMesh + TSL — the cross-backend constraint)

1. **bright-pass**: sample source → `luminance` → soft-knee `smoothstep(threshold-knee, threshold+knee)`
   mask → `color·mask` into a **half-res** `bright` target (half-res widens the glow cheaply).
2. **horizontal blur**: `bright` → `blurA`, the normalised Gaussian kernel along X (texel step = uniform).
3. **vertical blur**: `blurA` → `blurB`, same kernel along Y.
4. **composite**: **one** fullscreen draw into the supplied output: `source.rgb + blurB.rgb · strength`.

### Cross-backend correctness notes (the load-bearing decisions)

- **Only `QuadMesh` + `texture()`/`uniform`/`luminance`/`smoothstep`/vector-math TSL.** No instancing, no
  compute, no per-instance attributes — exactly the primitive `Blit`/rotozoomer use, which TSL lowers to
  both WGSL (WebGPU) and GLSL (WebGL2). This is why the parked GPU instanced-dot renderers (DotCloud /
  BallCloud / StarCloud) were *not* reused: the STATUS notes for dot-tunnel record that three's instanced
  geometry delivers no per-instance data on the WebGL2 node backend.
- **The composite is a single combined pass, not copy-then-additive-blend.** The renderer's `autoClear`
  defaults to `true`, so two QuadMesh draws to the *same* output target would have the second clear the
  first. Folding `source + glow` into one shader sidesteps that entirely. Every other pass writes to a
  *distinct* target, so autoClear is harmless there.
- **`setSource` is called once per scratch (re)allocation, never per frame.** Rebinding the source rebuilds
  the TSL graph (recompile); doing it every frame is the kind of per-frame texture churn that froze the
  plasma LUT on Firefox/WebGL2. The scratch RT identity is stable between resizes, so the source binds once
  in `BloomComposite.resize`.
- Scratch/blur targets are `depthBuffer:false`, `LinearFilter`, `generateMipmaps:false`.

## Wiring (entirely inside each affected part — host untouched)

Each target part keeps its existing `surface.render(renderer, target.gpu)` for **authentic**. For
**modern** it constructs a `BloomComposite` in `applyMode()`/`applyFilter()` and renders:
`bloom.render(renderer, target.gpu, (r, scratch) => surface.render(r, scratch))`. `resize` forwards to
`bloom.resize(width, height)` (parts previously ignored resize since the 320×200 field is fixed; the bloom
scratch tracks the *output* resolution so the glow is display-sharp). `dispose` frees the bloom. Switching
to authentic disposes the bloom, so authentic carries zero post-process cost and zero look change.

Plasma differs slightly: its draw callback renders the field into `fieldTarget`, blits that into the bloom
scratch, then bloom composites into `target.gpu` — the authentic branch is its original two-step blit.

### Default tuning (per part, documented in-code as constants)

Threshold/knee are on **luma**; the glow source is the part's already-upscaled raster.

| part            | threshold | knee | strength | rationale |
|-----------------|-----------|------|----------|-----------|
| dot-tunnel      | 0.45      | 0.20 | 1.15     | bright dots on black — low threshold blooms the lit dots, black stays black |
| ddstars         | 0.45      | 0.20 | 1.10     | stars + "Desert Dream" reveal on black — soft twinkle halo |
| minivectorballs | 0.50      | 0.20 | 1.00     | shaded discs on black — soft ball halo |
| glenz           | 0.62      | 0.25 | 0.90     | additive glass solids over the FC backdrop — bloom the solid edges, keep the mid-tone backdrop |
| plasma          | 0.72      | 0.20 | 0.70     | full-frame colour — HIGH threshold so only the brightest crests glow, not a washed-out frame |

These are first-pass values chosen to enhance, not wash out; the visual result is **human-verified** (the
agent cannot see output). Tune in the lab by editing the `BLOOM_*` constants at the top of each part.

## Verification

`pnpm install` / `pnpm lint` (0; the one remaining warning is the pre-existing unused-field note in
`endpic/surface.ts`, present on the base commit) / `pnpm typecheck` (0) /
`pnpm vitest run --testTimeout=60000` (676 tests, 124 files) / `pnpm build` all green. Bloom is
human-verified visually in the lab on both `?backend=webgpu` and `?backend=webgl2`.

## Follow-ups / not done

- Values are eyeballed defaults; a lab UI slider for threshold/strength would speed tuning.
- A single shared `?backend`-aware bloom strength toggle (off/low/high) is not exposed — each part hard-codes
  its constants.
- Other glow-ish parts (techno-bars flash, lens, etc.) were intentionally left untouched per scope.

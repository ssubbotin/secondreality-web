# vector2 (Part #18 — KewlComplex city flythrough) — STATUS

Branch `build/25-vector2`. CI-green (lint / typecheck / test / build). **Un-wired** by design: the part is
not exported from `packages/parts/src/index.ts`; tests import directly from `packages/parts/src/vector2/`.

## What matches the original (verbatim)

- **Camera flythrough.** The 1801-frame camera path is decoded **bit-for-bit** from the actual compiled
  animation stream `U2E.0AB` using U2E.C's exact byte-stream grammar (`track-decode.ts`). The decoder
  consumes the whole 77,069-byte stream and reproduces the recorded camera rmatrix + position trajectory
  exactly (asserted against sampled frames: frame 0 = (46712, 1346, −2151); final =
  (76297, −28448, 95565) with the recorded rotation matrix). This is the real flythrough, not an
  approximation.
- **Projection + transform math.** `mulmatrices`, `calc_applyrmatrix`, `calc_rotate`, `calc_singlez`,
  `calc_project`, `vid_cameraangle` (with the verbatim `AVISTAN` tangent table) and `vid_window` are
  ported from ACALC/AVID with BigInt 64-bit intermediates so the 16.14 fixed-point `imul`/`idiv`/`shrd`
  truncation matches the x86 exactly. FOV is the original constant `0x1C00`.
- **Flat shading + culling.** `normallight` (light vector `12118,10603,3030`, `>>21`, +128, clamp),
  `calclight` (shade ramp `>>3/4/5`, clamp [1,30]) and `checkculling` (`N·V ≥ 0`) are verbatim. Face
  normals use OPT.C's Newell method, negated and UNIT-normalised, so the cull sign is correct.
- **Geometry + materials.** CITY.ASC is parsed exactly per READASC.C semantics (per-face default material
  with a single-preceding-face override; `tunneli` correctly stays default). The ASC→engine ×10 scale and
  −169 Z shift were fitted against the engine's own binary objects (U2E.001/.002) — verified to the unit.
- **Palette.** The real `U2E.PAL` (256 × 6-bit VGA, ×4 → 8-bit, sRGB-tagged) so the material shade ramps
  land verbatim.

Rendered preview frames (CPU raster → U2E palette) show a coherent, recognisable city flythrough:
flat-shaded grey/cyan/blue buildings, platforms, a tree-lined street receding in perspective, and the
camera threading between tall structures.

## What is approximated / deferred (frank)

- **Object set is the CITY.ASC subset, not the final U2CITY11 scene.** The shipped animation references
  **58 objects** (logo, detail buildings, cars, `fcirto` signs, extra `talot##` blocks, tree/car copies),
  but `CITY.ASC` — an earlier project iteration and the only *readable* geometry export — contains only
  **25 of those meshes**. The bake maps every visible object index onto its ASC mesh where it exists and
  **drops the ones that don't** (logo, `talojota`, `s01`, `tunneli2`, `minitalo`, `fcirto*`, `talokoe`,
  `pysty01`, `Car02`, `katdetai*`, `KDETAIL*`, `plushouse`, `talot03..05`). Net effect: **1316 / 1801
  frames** show ≥ 1 ASC mesh (avg 2.85 meshes/frame); the rest of the flight (and the dense detail of the
  full scene, including the FC logo finale) is geometry we do not have in readable form. Porting the
  remaining objects means decoding the binary `U2E.003..U2E.042` chunk files (or `U2CITY11.PRJ`) — left as
  follow-up; the parser hooks (`track-decode`, `co-names`) already resolve their indices.
- **Per-object animated transforms are not applied.** A handful of objects move/rotate in the stream
  (`co[2]=BuildingH` rotates; some cars/signs translate). The decoder captures these, but the renderer
  draws the ASC meshes at their **baked world position** only (most are identity anyway). The moving few
  are minor; documented here rather than wired.
- **Modern mode = the CPU raster upscaled (LinearFilter), not native GPU geometry.** Same decision glenz
  shipped with. The `nodes.ts` CityScene experiment (real three.js meshes + a PerspectiveCamera driven
  from the rmatrix view) was cut to keep the modern view provably correct; a native flat-shaded GPU pass
  with a true bloom/AA chain is the follow-up. Both modes are pixel-faithful today; modern just gets a
  smooth upscale.
- **Painter sort is object-level (centre Z), faces unsorted within a mesh.** The original used
  precomputed per-direction polygon order lists (`o->pl[1..8]`); we approximate with vertex-0 centre-Z
  object sort + back-face cull. For the mostly-convex city shells this reads correctly; a concave object
  seen from a bad angle could mis-order internal faces.
- **Window clipping is screen-bounds only.** `vid_window` sets the projection centre + VF flags (ported);
  the original also clipped fills to the 320×150 window via `rows[]`/ADRAWCLP. We render the city across
  the full 320×200 (the original had a background picture outside it). No background picture/overlay — the
  whole picture pipeline is deferred per the brief; the field clears to black.
- **Playback rate** is a fixed 35 Hz accumulator (the original's `currframe += 2` under a ~70 Hz copper).
  The exact copper resync cadence (variable, A/V-locked) is not reproduced; the lab self-loops the 1801
  frames.

## Oracle / tests (64 tests, all green)

No byte-exact frame oracle exists (fidelity is visual). Instead each ported primitive is unit-tested:
`asc.test` (counts + sample coords vs the CITY.ASC text, READASC material semantics), `fixed.test`
(matrix identities + signed-truncation), `project.test` (AVISTAN FOV, perspective divide, light, cull),
`material.test` (U2E.MAT), `geometry.test` (×10 scale vs binary objects, Newell normals), `track-decode`
(camera trajectory + visibility decoded **verbatim** against the real U2E.0AB), `raster`/`renderer`/
`vector2` (non-empty fills, full-flythrough sweep without crash), and `bake.test` (the committed model
JSON regenerates deterministically and stays in sync with the lab asset).

## Files

Geometry/camera assets vendored to `packages/parts/src/vector2/__fixtures__/` (CITY.ASC, U2E.0AB, U2E.00M,
U2E.PAL, U2E.MAT) and the baked model + palette to `apps/lab/public/models/vector2.{json,pal}`.

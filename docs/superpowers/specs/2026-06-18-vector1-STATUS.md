# Vector Part I — "Space battle" (vector1) — STATUS

Branch: `build/24-vector1`. CI: lint / typecheck / test / build all green (134 tests, 32 for vector1).
**Un-wired** by design — the Effect is implemented and unit-tested but NOT exported from
`packages/parts/src/index.ts` and NOT added to the lab; tests import directly from the part's files.

## What this is

The first 3D vector scene: the Pixel ships (s01 / "Sippi" / "moottori") sweeping past a static observer,
played back from the original baked U2A animation track. Authentic (chunky mode-X CPU raster) +
modern (real three.js flat-shaded meshes) with `setMode()`, default modern.

## Fidelity — what is EXACT

- **Geometry**: the actual compiled engine objects (`U2A.001/002/003`) the demo rendered, parsed by a
  verbatim port of `VISU.C vis_loadobject` (16-bit-int chunk format). Vertex/normal/face counts and sample
  coordinates are oracle-tested against the binaries (s01: 159 v / 124 f; Sippi: 285 v / 75 f; moottori:
  45 v / 20 f). These carry the converter's exact engine-space coords, face normals and material colours —
  strictly more faithful than re-deriving from the `.3DS` source (kept in `3DS/` for provenance only).
- **Camera + object animation track**: a verbatim port of the `U2A.0AB` byte-stream decoder from
  `VISU/C/U2A.C` (the shipped `CALKU.BAT`/`SRA.BAT` build). All 521 frames, the static camera pose, the FOV,
  the on/off timeline (Sippi@16, pixel ships@259/270) and the accumulated per-object matrices are
  oracle-tested. The choreography is exact to the integer.
- **Fixed-point 3D math**: `calc_applyrmatrix` / `calc_rotate` / `calc_singlez` / `calc_project` from
  `ACALC.ASM`, with the 16.14 fixed point reproduced exactly (BigInt for the 64-bit `imul`/`shrd`
  intermediates, truncating `cdiv` for the perspective `idiv`). Oracle-tested against the camera matrix.
- **Flat shading / culling**: `ADRAW.ASM` `calclight`/`normallight` (light vector `12118,10603,3030`, the
  `>>5 +128` clamp, the shade-mode shift) and the back-face cull (`n.v >= 0`), plus the draw_polylist face-
  flag merge. Shade offsets are oracle-tested against the original face normals; the rendered palette index
  is `baseColour + shade` into the real `U2A.00M` VGA palette.
- **Painter ordering**: objects Z-sorted back-to-front by their centre-vertex distance, as in U2A.C.

## Fidelity — what is APPROXIMATED (and why)

- **FOV -> projection law**: `vid_cameraangle(fov)` survives only in the compiled `AVID.OBJ` (no ASM
  source). The stream's FOV byte is constant `0x2200` for the whole U2A scene, so the frustum never
  changes; we set the projection once from the mode-X base (`projmulx=250, projmuly=220, projaddx=160,
  projaddy=100`, `AVIDM1.ASM`) and never apply a per-frame FOV scale. For this scene that is exact (FOV is
  constant); the byte->multiplier mapping is documented as the one unknown. The modern perspective camera
  derives its vertical fov from `projmuly`/`addY`.
- **Per-vertex gouraud -> flat**: 113 of s01's 124 faces (and some of moottori's) carry the gouraud flag;
  the original interpolated per-vertex normal shades across them. We render every face FLAT (the face
  normal, the `calclight` value at the face) — the shade *mode* (16 vs 32 fade length) is still honoured.
  Visually the ships read as faceted flat-shaded vectors, which is the recognizable vector-part look; the
  smooth gouraud gradient is the documented simplification.
- **Polygon clipping**: the original clipped polygons in 3D (`ADRAWCLP newclip`) before projecting; we
  project then clip in screen space in the raster. For these convex-ish ship faces at the scene's angles
  this is visually identical (verified by the ASCII frame dumps — ships fill the view correctly, no
  smearing). A vertex grazing the near plane can fling far off-screen before the screen clip catches it;
  harmless (clamped to the viewport).
- **Modern path lighting**: the modern renderer uses a real `DirectionalLight` along the engine `newlight`
  direction + `MeshLambertNodeMaterial` flat shading (DoubleSide, since the engine->three (1,-1,-1)
  view-space flip mirrors winding) rather than the LUT fade-ramp. Same direction, same faceted look, sharp
  and lit; not a byte-for-byte match of the authentic palette ramp (that is the authentic path's job).

## Deferred (documented, not attempted)

- **Background picture + copper palette animation** (`U2A.LBM` / `U2ABG.UH`): needs the picture pipeline.
  The field is a flat dark clear (index 0). The ships read correctly over it; the FC starfield/overlay is a
  follow-up once the picture pipeline lands.
- **`pl[1..8]` precomputed direction sort lists**: we Z-sort polygons directly (the engine precomputed 8
  per-object orderings for speed). Visually identical here.
- **obj3 "moottori"**: parsed and shipped but, exactly like the shipped U2A track, never switched on.

## Verification done

- Authentic CPU path verified by ASCII frame dumps (frames 40/120/300/400): Sippi looms over the whole
  screen at the open, multiple ships cluster centre-frame mid-scene — the recognizable space-battle.
- Modern path: matrix/transform math (`engineToViewMatrix`) unit-tested; the WebGPU render itself was not
  headless-captured here (no GPU in this env) — wire the Effect into the lab to eyeball it. The geometry,
  camera and transforms derive from the same oracle-verified world matrices, and `pnpm build` compiles the
  three/webgpu node-material path.

## Files

`packages/parts/src/vector1/`: `fixed.ts`, `model.ts`, `anim.ts`, `assets.ts`, `light.ts`, `scene.ts`,
`raster.ts`, `nodes.ts`, `vector1.ts` (+ a `*.test.ts` each except the thin Effect shell). Assets in
`__fixtures__/` and `apps/lab/public/models/vector1/`.

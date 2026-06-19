# Vector Part I — "Space battle" (slug: vector1, part #8) — design

Faithful web port of Second Reality's first 3D vector scene: the rotating Pixel ships sweeping past a
near-static observer (the "space battle"). Driven by the original VISU engine and the baked U2A
animation track.

## Source of truth

- **Scene player:** `/home/sergey/SecondReality/VISU/C/U2A.C` (the shipped build — `CALKU.BAT` compiles
  the track with `c -s10.0 u2a`, `SRA.BAT`/`TEST.BAT` run the `u2a` player). `U2AOK.C` is an earlier
  copper-buffering variant; the *decoder*, *object format* and *camera math* are identical, so U2A.C is the
  canonical reference for the animation stream and the per-frame transform/draw loop.
- **VISU engine:** `VISU/VISU.C` (`vis_loadobject` / `vis_drawobject`), `VISU/ACALC.ASM`
  (`calc_applyrmatrix`, `calc_rotate`, `calc_singlez`, `calc_project`), `VISU/ADRAW.ASM`
  (`calclight`/`normallight` flat-shade, back-face cull, scanline fill), `VISU/CD.H` (`rmatrix`/`object`/
  `vlist`/`nlist`/`pvlist`/polydata layout).
- **Compiled scene assets (the baked geometry + camera track):**
  `VISU/C/SCENE/U2A.001` (ship "s01" = PXLSHIP, 159 verts / 124 polys, instanced x3),
  `U2A.002` ("Sippi", 285 verts / 75 polys), `U2A.003` ("moottori"/engine, 45 verts / 20 polys),
  `U2A.00M` (256-colour VGA palette + the object index list), `U2A.0AB` (the 522-frame baked animation
  stream: per-object matrix/position deltas + FOV), `U2A.0AA` (the scene-list, a single scene here),
  `U2A.MAT` (material->base-colour map), `U2A.INF` (`fov 48 / scene 1`).
- **Original 3DS models** (kept for provenance, *not* used at runtime — the compiled engine objects are
  more faithful since they carry the converter's exact vertex/normal/colour layout in engine space):
  `3DS/PXLSHIP.3DS`, `PXLSHIP2.3DS`, `PXLSHIP3.3DS`, `I_SHP_3.3DS`, `PASKA2.3DS`.

## Why replay the compiled engine objects + baked stream (not re-parse .3DS)

The "animation track" in this scene is **not C arithmetic** — `U2A.C` is a *player* of a precompiled
binary stream. `c.exe` (the converter) baked the 3D-Studio `.PRJ` keyframes (`3DS/U2*.PRJ`) into
per-frame integer deltas in `U2A.0AB`, and the `.3DS` meshes into the engine object format
(`U2A.001/002/003`). Replaying those binaries *is* the original choreography, exact to the integer. So the
port:

1. Parses the engine object format (`VISU.C vis_loadobject`): chunked `TAG`(4)+`len`(4 long) blocks —
   `VERS`/`NAME`/`VERT`/`NORM`/`POLY`/`ORD0`/`ORDE`. **All `int` fields are 16-bit** (DOS Turbo-C), all
   `long` 32-bit. `vlist` on disk is 16 bytes packed (x,y,z longs + normal short + reserved short);
   `nlist` 8 bytes (x,y,z,reserved shorts). polydata records: `sides,flags,color,reserved` bytes + `normal`
   word + `sides`x vertex words. `pl[0]` is the unsorted poly list (word count, centre vertex, poly
   offsets, 0 terminator); `pl[1..8]` are precomputed sort orders we don't need (we Z-sort polygons
   ourselves).
2. Decodes `U2A.0AB` with the **exact** `U2A.C` byte decoder (`lsget` + the `0xff`/`0xc0`/`0x80`/`0x40`/
   `0x30`/`0x40`-matrix opcode grammar) into accumulating `r0` matrices for all 6 `co[]` slots per frame.

## Scene facts (decoded from U2A.0AB)

- **522 frames**, then opcode `FF FF` = `resetscene` (the track loops). At 70 Hz this is ~7.46 s.
- **co[0] is the camera** and is *static*: pos `(-221,-323,7088)`, matrix
  `[-16385,0,0, 0,10,-16384, 0,-16384,-10]` (~ -90 deg pitch / look-down + tiny roll), FOV constant
  `0x2200` (8704). The "swooping camera" is **the ships moving** past the fixed observer, not a moving eye.
- Object index list (`U2A.00M`): `co[1]->obj1 (s01)`, `co[2]->obj2 (Sippi)`, `co[3]->obj3 (moottori)`,
  `co[4]->copy of obj1`, `co[5]->copy of obj1`. So 3 unique meshes; the pixel ship "s01" appears x3.
- Visibility/timeline (frame: event): 16 co[2] ON; 259 co[1]+co[4] ON; 270 co[5] ON; 514 co[1] OFF;
  517 co[5] OFF; 519 co[4] OFF; 520 co[5] ON; 521 reset. obj3 (moottori) is loaded but never switched on
  in this track.
- Ships accumulate a large `-Y` translation (co[2] sweeps y -9178 -> -519890) with per-frame rotation —
  they fly "up and away" through the rotated camera frame.

## Fixed-point math (ported verbatim, C truncation matched)

- `UNIT = 16384`, `UNITSHR = 14`. rmatrix = 9 rotation longs (fixed-point /UNIT) + x,y,z longs.
- `calc_applyrmatrix(o.r, cam)` (ACALC `mulmatrices2` + `rotatesingle` + translate):
  `o.r.m = cam.m . o.r0.m` (each element `sum cam[k].a[k] >> 14`), then `o.r.{x,y,z}` = `o.r0.pos` rotated
  by `cam.m` (`>>14`) **plus** `cam.pos`.
- `calc_rotate` rotates a vertex by `r.m` (matrix elements used as **signed 16-bit**, `movsx word`) with a
  64-bit intermediate `>>14`, then adds `r.{x,y,z}`.
- `calc_singlez` = the Z row of `calc_rotate` for the centre vertex -> the object sort key.
- `calc_project` perspective divide: `sx = (projmulx.X)/Z + projaddx`, `sy = (Y.projmuly)/Z + projaddy`,
  with `Z` clamped to `projclipz` `[256, 1e9]`. Mode-X base: `projmulx=250, projmuly=220, projaddx=160,
  projaddy=100` (`AVIDM1.ASM`), `projaspect=225` (non-square mode-X pixels). Integer divide truncates
  toward zero.
- Back-face cull (`ADRAW checkculling`): face hidden when `normal . vertex >= 0` (after rotation).
- Flat shade (`ADRAW calclight`/`normallight`): `b = (n.newlight) >> (2*14-7-16) + 128`, clamped 0..255,
  with `newlight = (12118,10603,3030)`; the L32/L16 material fade then maps `shade 0..30` onto
  `color..color+len`. Final palette index = `baseColor + shade`.

## FOV / projection caveat (approximated, documented)

`vid_cameraangle(fov)` survives only in the compiled `AVID.OBJ` (no ASM source). The FOV byte in the
stream is constant `0x2200` here, so the camera frustum never changes — we set the projection multipliers
once from the mode-X base (`projmulx/y`) and document the byte->multiplier law as an approximation (a
focal-length scale derived from the fov; the constant-FOV scene hides any error).

## Rendering

- **authentic:** the CPU pipeline at mode-X 320x200 into an 8-bit index buffer, blitted through the VGA
  palette (sRGB-tagged so DAC bytes land verbatim) with `NearestFilter` — chunky. Pipeline =
  apply camera -> rotate verts -> project -> per-object Z-sort -> per-face cull + flat shade + scanline
  fill, painter's-ordered by object distance (`calc_singlez`), exactly as `U2A.C`'s draw loop.
- **modern (default):** real three.js — one `BufferGeometry` per mesh, flat-shaded indexed triangles with
  the same per-face base colour and a matching directional light, a `PerspectiveCamera` placed from the
  ported (static) camera matrix, transforms driven by the decoded per-frame matrices. Same geometry, same
  choreography, sharp at full viewport with `LinearFilter`.
- The Effect drives the track on a fixed-timestep accumulator at `SIM_HZ = 70` (mode-X cadence), loops at
  frame 521, renders into the **supplied** RenderTarget, and disposes all GPU resources.

## Deferred

- The U2A background picture (`U2A.LBM`/`U2ABG.UH`) and the copper-bar palette animation — needs the
  picture pipeline; stubbed to a flat dark field (documented in STATUS).
- The `pl[1..8]` precomputed direction sort lists (we Z-sort polygons directly; visually identical for a
  convex-ish ship at these angles).
- obj3 "moottori" geometry is parsed and shipped but, like the original track, never switched on.

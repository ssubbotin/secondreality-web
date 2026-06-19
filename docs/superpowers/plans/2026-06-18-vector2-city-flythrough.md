# Part #18 — Vector Part II: the KewlComplex city flythrough (VISU / U2E)

slug: `vector2` · branch: `build/25-vector2` · part dir: `packages/parts/src/vector2/`

## What it is

The second baked 3D-vector scene: the camera flies through a 3D city of flat-shaded buildings. In the
original this is the VISU engine (`/home/sergey/SecondReality/VISU`) playing the compiled `U2E` scene.

## Source of truth

- **Geometry:** `3DS/CITY.ASC` — the 3D Studio R4 ASCII export. 27 `Named object` blocks: 25 Tri-mesh
  objects (platforms, buildings, streets, a tunnel, trees), `Camera01`, and `Light02` (a direct light,
  no mesh). 610 vertices / 796 faces across the meshes. Materials: GRAYCEMENT / BLUEMETAL / CYANMETAL /
  GREENGRASS (+ the 3DS default for `tunneli`, which declares none).
- **Camera + object animation:** `VISU/C/SCENE/U2E.0AB` — the compiled animation byte-stream that
  `VISU/C/U2E.C` plays back (its inner `while(repeat--)` / `while(!xit)` parser). 77,069 bytes →
  **1801 frames** of camera rmatrix + per-object on/off, decoded verbatim. `VISU/C/SCENE/U2E.00M` carries
  the object index table (`conum = 58`, camera = object 0). FOV is held at `0x1C00` for the whole flight.
- **Engine math:** `VISU/ACALC.ASM` (`mulmatrices`, `_calc_applyrmatrix`, `_calc_rotate`,
  `_calc_singlez`, `_calc_project`), `VISU/AVID.ASM` (`_vid_cameraangle` + `AVISTAN.INC`, `_vid_window`),
  `VISU/ADRAW.ASM` (`calclight` / `normallight` / `checkculling`), `VISU/C/OPT.C` (face-normal Newell
  method), `VISU/C/READMAT.C` / `READASC.C` (materials), `VISU/CD.H` / `C.H` (structs, UNIT = 16384).

## Pipeline (per frame)

1. **Bake (offline, `bake.ts`):** parse CITY.ASC → scale verts ×10 into engine space (+ a −169 Z ground
   shift, both fitted against the binary objects U2E.001/.002), compute per-face Newell normals
   (negated, UNIT-normalised), assign material base colour + shade shift. Decode U2E.0AB → camera track.
   Map each visible animation object index → ASC mesh (via the `co[]` name table). Emit a 268 KiB
   `vector2-model.json`.
2. **Runtime, per frame:** transform each visible mesh's verts by the camera rmatrix (`calc_rotate`),
   rotate its face normals (`rotateSingle`), project (`calc_project`), painter-sort the objects by centre
   Z (`calc_singlez`), back-face cull (`N·V ≥ 0`), flat-shade (`calclight`), and scanline-fill the
   triangles into a 320×200 palette-index buffer.
3. **Blit:** map the index buffer through the U2E palette (6-bit ×4, sRGB-tagged) and upscale into the
   supplied RenderTarget. Authentic = NearestFilter (chunky mode-X); modern = LinearFilter (smooth).

## Module split (pure logic unit-tested away from the GPU)

`asc.ts` (parser) · `fixed.ts` (rmatrix math) · `project.ts` (projection/FOV/light/cull) ·
`material.ts` · `geometry.ts` (city assembly + normals) · `track-decode.ts` (U2E.0AB decoder) ·
`co-names.ts` (object table) · `bake.ts` (asset converter) · `renderer.ts` (per-frame CPU pipeline) ·
`raster.ts` (triangle fill) · `palette.ts` · `nodes.ts` (RasterSurface blit) · `vector2.ts` (the Effect).

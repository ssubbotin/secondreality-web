# vector1 / Space battle (#8) — render fix STATUS (2026-06-19)

Branch `fix2/vector1`, based on `e66edb8`. Two observed lab bugs (modern mode, the default):

1. **TOO DARK** — the flat-shaded ships rendered near-black on black, barely visible.
2. **INTERLACED FACES** — polygon faces showed horizontal line gaps (every-other-scanline striping),
   as if half the fill was missing.

Both bugs lived in the **modern GPU mesh path** (`VectorScene` in `nodes.ts`). The **authentic CPU raster
path was already correct** (verified — see below). The fix routes *both* modes through the proven CPU
rasteriser, matching the precedent already set for dot-tunnel (part #5, commit `0e762c2`
"render modern mode via the CPU rasteriser").

## Diagnosis against the original (VISU)

### Shading model — `VISU/ADRAW.ASM`

- `newlight dw 12118,10603,3030` — the fixed light direction (`light.ts` `NEWLIGHT`, matches).
- `normallight` — dot the rotated face normal with `newlight`, take the high word, `sar` by
  `2*unitshr-7-16 = 2*14-7-16 = 5`, `add 128`, clamp 0..255 (`light.ts` `normalLight`, matches;
  `unitshr=14` from `VISU/AD.INC`).
- `calclight` — shade = `normallight >> cl`, where `cl = 6 - (shadebits>>10)` so SHADE32→`>>3`,
  SHADE16→`>>4`, SHADE8→`>>5`; clamp to `[1,30]` (`light.ts` `calcLight`, matches). The shift inherently
  bounds the shade to the material's fade-ramp length.
- `draw_polylist`: a face's drawn colour is `base + calclight(faceNormal)` (`@@nocl`/`@@yosh`). For
  `F_GOURAUD` faces the original adds the shade *per vertex* (the `@@gr1` loop builds `POLYGR`) and the fill
  interpolates; we keep the documented flat-per-face-normal simplification (already tested/accepted).

### Material fade ramps — `VISU/C/SCENE/U2A.MAT` + the 6-bit palette in `U2A.00M`

```
DEFAULT 96 L32      LIGHT_BLUE 32 L32 G     BLACK 0 L16 G
ORANGE 64 L32       GREY 128 L32 G          MOTOR 64 L32 G ...
```

Each material is a fade ramp whose **base index is the DARKEST entry**, brightening toward `base+ramp-1`.
Measured from the real `U2A.00M` palette (6-bit ×4):

| material | base idx | RGB at base+0 | RGB at bright end |
|----------|----------|----------------|--------------------|
| BLACK (L16) | 0 | (0,0,0) | idx 16 → (128,128,128) |
| LIGHT_BLUE (L32) | 32 | (20,36,80) | idx 63 → (156,208,252) |
| ORANGE (L32) | 64 | (92,36,60) | idx 95 → (252,144,152) |
| DEFAULT (L32) | 96 | (4,4,8) | idx 126 → (220,224,244) |
| GREY (L32) | 128 | (52,68,96) | idx 158 → (188,236,252) |

So the rendered palette index `base + calclight` is the literal flat colour; the shade **is** the lighting.

## Root causes

### Darkness (modern only)

`nodes.ts buildMesh()` built one three.js `Mesh` per face **base** colour and set the material colour to
`paletteColor(palette, face.color)` — i.e. the **darkest** ramp entry (BLACK→`(0,0,0)` pure black,
DEFAULT→`(4,4,8)`). It then relied on `MeshLambertNodeMaterial` + a `DirectionalLight` to brighten. The
shade offset (`calclight`) was never applied to the index, so the dominant BLACK-hull faces of the big ship
(`s01`) were `palette[0] = (0,0,0)` multiplied by a sub-1 Lambert term ⇒ pure/near black. The authentic
path was unaffected: it indexes `palette[base + calclight]` directly.

Verification: dumping the authentic raster for real frames showed the ship filling solidly with greys
`(44,44,44)…(128,128,128)` and, across the whole animation, reaching `colour 158 = (180,228,244)` (bright
blue-white) on lit faces — clearly visible, faithfully flat-shaded.

### Interlacing (modern only)

The CPU rasteriser (`raster.ts`) steps `y` by **1** and a per-frame coverage map showed **0 empty rows**
inside the ship bbox — no striping. The interlacing was a GPU-mesh artefact: the ships project very small
(tens of px) so most faces are sub-scanline slivers, and the `DoubleSide` + `MeshLambertNodeMaterial`
flat-shaded mesh produced winding/z-fight/sliver gaps on the node backend (the same class of cross-backend
unreliability that made dot-tunnel abandon its GPU dot path).

## Fix

- `vector1.ts`: both `update()` paths now build the painter-ordered polygon list with `buildFramePolys`,
  fill it with `rasterFrame`, and upload to the `RasterSurface`. The authentic↔modern toggle is purely the
  upscale filter — `NearestFilter` (chunky mode-X) vs `LinearFilter` (smoothed) — exactly the dot-tunnel
  pattern. Dropped the `VectorScene` GPU path, its `update`/`render` plumbing, and the size-dependent
  `resize` (the raster is a fixed 320×200 surface the host blit upscales).
- `nodes.ts`: removed the `VectorScene` class, `ModernObject`, `paletteColor`, and the unused three GPU
  imports. Kept `RasterSurface` and the unit-tested `engineToViewMatrix` (no current caller, retained for
  any future GPU-mesh experiment); fixed `RasterSurface`'s stale "rows flipped on write" comment — it
  writes straight through (`dst = row*W`), consistent with the orientation fix (no vertical flip).

No change to the ported math (`light.ts`, `fixed.ts`, `scene.ts`, `raster.ts`) — those were already exact.

## Verification

`pnpm install`, `pnpm lint` (exit 0; one pre-existing unrelated warning in `forest/surface.ts`),
`pnpm typecheck`, `pnpm vitest run --testTimeout=60000` (610 passed), `pnpm build` — all green.

## Follow-ups (out of scope)

- The original renders `F_GOURAUD` faces with a per-vertex shade gradient; we still collapse each gouraud
  face to its face-normal shade. The ships are bright and recognisable, but a true gouraud raster would add
  the smooth per-face gradient.
- The modern projection/aspect for a real GPU-mesh path (if revived) needs the mode-X focal lengths
  (`mulX=250`, `mulY=220` over 320×200), not the canvas aspect — the previous `PerspectiveCamera` fov was
  derived only from `mulY` and used the canvas aspect, compressing horizontally.
- The U2A background picture + copper palette animation remain deferred (flat dark clear).

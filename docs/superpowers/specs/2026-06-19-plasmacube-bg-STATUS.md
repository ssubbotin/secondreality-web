# plasmacube / Plasma-behind-cube (#14) — background composite STATUS (2026-06-19)

Branch `comp/plasmacube-bg`, based on `22bec5b`. The rotating textured cube was rendering over a black
clear; the original PLZPART draws the fullscreen summed-sine plasma field as the background with the cube
composited on top. This change restores the plasma background in both modes.

## What the original does (PLZPART/MAIN.C)

```c
main() {
    dis_partstart();
    init_copper();
    initvect();
    plz();      // the fullscreen summed-sine plasma — the part #13 plasma field
    vect();     // the rotating textured cube
    close_copper();
}
```

`plz()` (PLZ.C) rasterises the plasma across the wide copper-scrolled VGA buffer, then sets `cop_plz=0`
(COPPER.ASM `copper2` stops calling `moveplz`), freezing the last plasma frame in VRAM. `vect()` (VECT.C)
then page-flips through that same `0xA000` buffer and draws the cube into it — crucially, its clear is
**not** a fullscreen wipe: `do_clear` (PLZA.ASM) only clears the per-scanline min/max-x extent of the
*previously drawn* polygon (the `ctau`/`otau`/`ntau` bounding span), and `do_block` only writes the cube's
polygon footprint. Everywhere the cube does not cover, the plasma left in VRAM shows through. So the cube
composites on top of the plasma background. The plasma field/palette are the part #13 plasma's own module.

## Approach (faithful core + modern polish)

The plasma field is its OWN ported module (`packages/parts/src/plasma`). Per the task, it is **reused, not
re-derived** — the field math, sine tables and palettes are imported READ-ONLY:

- `../plasma/tables.js` (psini / lsini4 / lsini16 / ptau), `../plasma/palette.js`
  (`buildPlasmaPalettes`), `../plasma/phase.js` (`moveplz` / `moveplzL` / `INITTABLE_K` / `INITTABLE_L`).
- `../plasma/nodes.js` `PlasmaField` (the shipped GPU field pass) for the modern background.

### New module — `plasma-bg.ts` (CPU plasma background)

`PlasmaBackground` is the authentic-mode CPU equivalent of the shipped GPU plasma field. It reproduces the
shipped field's per-pixel index **exactly** so the chunky 320×200 authentic composite matches the modern
GPU composite. Per pixel (ASMYT.ASM `plzline` / `setplzparas`, mirrored in `plasma/nodes.ts` `fieldIdx`):

```
l16 = lsini16[(yy − 4·ccc + q2 + 320) mod 8192]      (lsini16 pre-scaled ×16)
l4  = lsini4 [(yy + 16·ccc + q4)       mod 8192]      (lsini4  pre-scaled ×8)
a1  = (8·ccc + l16 + q1)               mod 16384
a2  = (2·yy − 4·ccc + l4 + q3 + 320)   mod 16384
idx = (psini[a1] + psini[a2])          mod 256
```

with the scanline interlace choosing the `k` param set on odd `(floor(u·320)+floor(v·280))` cells and the
`l` set on even — identical to `plasma/nodes.ts`. Table fetches round-to-nearest (`floor(i+0.5)`) to match
the GPU `fetch`. `step()` advances the phase one VGA frame (COPPER.ASM `moveplz`); the Effect calls it once
per `SIM_HZ` tick, and `reset()` restores the section-0 init phase on the standalone-lab loop.

The cube part stays at the section-0 plasma palette (PLZ.C `pals[0]`, the RGB palette). The original's
copper palette fades (`cop_drop`/`timetable`/`pals[1..]`) belong to `plz()`'s standalone run, not the
cube's; the cube part keeps the single RGB plasma palette as its steady background, with the field
animating via `moveplz`.

### Composite ordering

The plasma palette and the cube palette index-collide (the plasma uses all of 0..255; the cube uses bands
at 0..191), so they cannot share one 256-entry LUT in a single index buffer. Compositing **in colour
space** is the faithful equivalent of the original's two sequential VGA passes:

- **Authentic** (`raster.ts` + `nodes.ts RasterSurface`): `PlasmaBackground.paint()` fills a plasma index
  buffer; `rasterCubeBuffer()` draws the cube into a separate buffer pre-filled with `CUBE_TRANSPARENT`
  (`0xFF`, never a cube tile value — bands span 0..191); `compositeToRgb()` writes, per pixel, the cube
  index through the cube palette where the cube drew, else the plasma index through the plasma palette.
  Cube ALWAYS wins where it drew (plz() then vect()).
- **Modern** (`nodes.ts CubeBackground` + `CubeMesh.render(..., overBackground)`): the shipped `PlasmaField`
  renders the field, blitted fullscreen into the output target, then the GPU cube renders on top with
  `autoClear=false` + `clearDepth()` so it composites over the plasma instead of clearing to black.

### Unchanged

The cube transform / texture / raster and the **orientation are untouched** — `rasterCube` keeps its
clear-to-0 contract (still covered by the original `raster.test.ts`); the new path uses the added
`drawCubeFaces` (no clear) + `rasterCubeBuffer` (sentinel fill). Surfaces write `dst=row*W`, texture row 0 =
screen top; **no vertical flip** was introduced (the stale "flipped" docstring on `RasterSurface.update`
was corrected to match the code).

## Tests

- `composite.test.ts` — composite ordering: `rasterCubeBuffer` re-fills with the sentinel and draws faces
  over it; `compositeToRgb` picks the cube palette where the cube drew and the plasma palette elsewhere; a
  fully-transparent cube layer leaves the plasma fully visible.
- `plasma-bg.test.ts` — the CPU field matches the shipped GPU `fieldIdx` formula at sampled pixels;
  range/non-blank; `step()` animates the field; `reset()` is deterministic; section-0 palette is the
  plasma RGB palette.

## Verification (all green)

`pnpm install`, `pnpm lint` (exit 0; the one remaining warning is the pre-existing unused `height` in
`endpic/surface.ts`, untouched here), `pnpm typecheck`, `pnpm vitest run --testTimeout=60000` (619 passed),
`pnpm build`.

## Cited original sources

`PLZPART/MAIN.C`, `PLZPART/PLZ.C`, `PLZPART/VECT.C`, `PLZPART/ASMYT.ASM` (`plzline`/`setplzparas`),
`PLZPART/COPPER.ASM` (`moveplz`/`copper2`), `PLZPART/PLZA.ASM` (`do_clear`/`do_block`).

# glenz / Glenz vectors (#4) — FC backdrop restore STATUS (2026-06-19)

Branch `comp/glenz-bg`, based on `22bec5b`. The glenz additive solids previously rendered over a
**procedural copper-bar stub** (`buildCopperBackground`). The original draws the **FC backdrop picture**
(the Future Crew logo) behind them. This change restores that real background, faithfully from the 1993
source, while keeping the additive XOR/OR glenz fill and the two solids unchanged.

## What the original does (GLENZ/MAIN.C + NEW.ASM)

- `extern char fc[]` is the FC picture (incbin'd `_fc.obk` = the raw bytes of **`GLENZ/FC.UH`**). MAIN.C
  addresses it directly: palette at `fc[a+16]` (16 colours × 3), pixels at `fc+768+16` — i.e. a 16-byte
  header, a 768-byte 6-bit VGA palette (256 entries), then `320*200` raw 8-bit indices, top row first.
- The intro scrolls/zooms the picture into VRAM, then `memcpy(bgpic, vram, 64000)` snapshots it as the
  background (MAIN.C, around the `dis_getmframe()<333` gate).
- Per frame the glenz scanline filler ORs each solid's colour over that snapshot:
  **`NEW.ASM ng_pass3` reads the background from `SEG _bgpic` (`fs`) and does `or ah,fs:[di]`** before
  writing to screen. So the background the glenz fill composites over *is* the decoded FC picture.
- The live 16-colour DAC ramp is the picture's own palette: `backpal[a] = fc[a*3+0x10]` (MAIN.C:540-547).
  The 256-entry loop DAC table is `tmppal` (MAIN.C:366-388): indices 0..15 = `backpal`, indices ≥16 reuse
  `backpal[a&7]` brightened by the lit bit (`a&8 → +16`).

## Asset: FC.UH is the raw "Uh1" format, NOT the RLE `.U`

The task hint said "use `@sr/engine decodePicture`", but **FC.UH does not match that decoder**. Its magic
is `"Uh1\0"` (`0x6855…`), a *raw uncompressed* picture, whereas `decodePicture` reads the `fcfc…` RLE `.U`
format (with the `add`/per-row-RLE layout). The same `"Uh1"` raw format is used across the demo tree
(`GRID/EYE4.UH`, `TWIST/TMP.UH`, `JPLOGO/PIC.UH`, `ENDPIC/PIC.UH`, `LENS/G2.UH`, …) — all 320×200, 64784
bytes = 16 + 768 + 64000.

So the part ships a tiny raw reader, `glenz/fc-picture.ts` `decodeFcPicture` (16-byte header → 768-byte
6-bit palette → raw index plane), unit-tested **byte-exact** against the vendored fixture
(`fc-picture.test.ts`): dimensions, the full palette equals on-disk `[16, 16+768)`, the full index plane
equals `[16+768, …)`, and the picture only uses the indices it actually defines (`0..7, 12..14`).

`PIC001.LBM`/`PIC002.LBM` (the task's listed LBM alternates) were checked and are a **different image**
(grey CMAP, different pixels) — not the FC backdrop — so FC.UH is the correct source. They are left
unused.

## What changed in the part (`packages/parts/src/glenz/`)

- **`fc-picture.ts`** (new): `decodeFcPicture` (raw "Uh1"), `fcBackpal` (the 16-colour ramp = first 16
  palette entries, MAIN.C `backpal`), `fcBackground` (the 320×200 `bgpic` index buffer). Centres a smaller
  picture inside the field; FC.UH is exactly 320×200 so it is a straight copy.
- **`palette.ts`**: removed the procedural `buildCopperBackground` stub. `buildGlenzRenderPalette` now takes
  the FC `backpal` and bases every pixel on it: the low nibble (bits 0..3) selects one of the FC picture's
  16 colours (so a pixel the solids never touch renders the FC backdrop colour verbatim), and the glenz
  overlay bits (the high nibble + the demo_glz "lit" bit 3) brighten toward a cool blue-white glass
  highlight as coverage rises. `buildGlenzPalette` (the byte-exact `tmppal` reference) and `buildBackpalRamp`
  (a known fixture for that test) are kept.
- **`glenz.ts`**: `load()` now fetches `/pics/FC.UH`, decodes it, and builds the background +
  render-palette from it (with a neutral black-backpal fallback before load completes). The per-frame
  copper-phase rebuild is gone — the FC backdrop is a static background the additive fill ORs over.
- **Vendored**: `FC.UH` into `__fixtures__/` (for the byte-exact test) and `apps/lab/public/pics/` (served
  to the lab; Vite copies it into `dist/pics/`).

The glenz fill (`glenz-fill.ts`), the solids/geometry (`geometry.ts`), the per-face colour assignment
(`render.ts`), and the GPU surface (`nodes.ts`) are **unchanged**. Orientation is preserved: the surface
writes `dst = row*W` (no vertical flip), texture row 0 = screen top — the FC picture and the index buffer
share that top-row-first convention, so the backdrop is upright.

## Documented compromises (carried over / noted)

1. **Per-face DAC reprogramming → coverage brightening.** `VEC.ASM demo_glz` reprograms the VGA DAC per
   visible face (`out dx,al` from each face's brightness + a rolling colour slot), so overlapping faces
   blend additively at run time. A static index→colour LUT cannot reproduce that, so the glenz overlay
   brightening is keyed by coverage (number of set glenz bits) over the FC base. This was already the
   part's accepted compromise; the only change here is that the **base is now the real FC backdrop** rather
   than a synthetic copper ramp.
2. **Copper palette fade.** MAIN.C's `copper()` callback fades the 16-colour `pal[]` in/out at the loop
   edges (frame < 765 fade-in, frame > 1280+789 fade-out). The web render palette is static (FC colours at
   full), which is the dominant visible state across the looped window; the edge fades are not animated.

## Verification (all green)

`pnpm install`, `pnpm lint` (exit 0; the single warning is a pre-existing unused field in
`endpic/surface.ts`, outside this part — present on the base commit), `pnpm typecheck`,
`pnpm vitest run --testTimeout=60000` (618 tests pass; 55 in glenz, 7 new in `fc-picture.test.ts`),
`pnpm build`. Visual QA (human) pending: confirm the FC logo backdrop shows behind the glass solids in
both authentic and modern modes.

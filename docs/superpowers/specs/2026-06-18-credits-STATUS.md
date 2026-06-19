# STATUS — Part #20 "Credits / greetings scroll" (ENDSCRL)

Branch: `build/23-credits`. Slug: `credits`. Source of truth:
`/home/sergey/SecondReality/ENDSCRL/MAIN.C` + `ASMYT.ASM` (the greetings variant `CREDITS/MAIN.C`
is documented for provenance but not built — see below).

## What shipped

A faithful port of the closing **vertical text scroller**: horizontally centred lines from the
`FONA.UH` bitmap font scroll up one pixel per frame; content is `ENDSCROL.TXT`. CI-green, **un-wired**
(tests import directly from the part dir; `packages/parts/src/index.ts` is untouched).

Files under `packages/parts/src/credits/`:

- `decode-u.ts` (+test) — the `.U`/`.UH` decoder (header + 6-bit VGA palette + raw/RLE pixel block).
- `font.ts` (+test) — `init()` glyph segmentation, `FONA_ORDER` (74-byte order from MAIN.C:13),
  forced space cell (`x=1500-20, w=16`), `measure()`.
- `scrolltext.ts` (+test) — `ENDSCROL.TXT` → newline-split lines (`\r`/`\t` kept as zero-width).
- `layout.ts` (+test) — `centerOffset(width) = trunc((639-width)/2)` (C truncation, incl. negative).
- `scroll.ts` (+test) — `scrollAt(frame,height)` (1px/frame, wrapped), `rowToLineRow`, `contentHeight`.
- `palette.ts` (+test) — the exact greyscale ramp from the `setrgbpalette` calls.
- `raster.ts` (+test) — `blitScanline` (the `do_scroll` inner loop) and `rasterField` (full window).
- `nodes.ts` — `RasterSurface`: 640×400 index field → sRGB DataTexture LUT (×4) + `Blit`; `setFilter`.
- `credits.ts` — the `Effect` + `setMode` on a 70 Hz fixed-timestep accumulator; renders into the
  supplied `RenderTarget`.
- `index.ts` — local re-exports (the part stays un-wired from the package barrel).

Assets vendored to `apps/lab/public/pics/` (`FONA.UH`, `ENDSCROL.TXT`) and
`packages/parts/src/credits/__fixtures__/` (same two, for byte-exact unit tests).

## Fidelity findings

- **One font scanline per frame, 30 rows per line, no gap.** `do_scroll` renders font row `line`
  (cycling 0..29 = FONAY) each frame while `yscrl` advances 1px/frame, so a text line is exactly 30
  vertical pixels with no inter-line gap. The web port models this as a continuous pixel scroll
  position and rebuilds the whole visible window each frame (instead of the original's 401-line
  circular VGA buffer + CRTC start-address trick), which is render-equivalent.
- **Colour index = ink level.** The font is 2-bit (values {0,1,2,3}). The original ORs plane bits
  1/2 into a freshly-cleared scanline, so each written pixel's colour index equals its ink level
  1..3. Palette: 0 = black, 1 = (20,20,20), 2 = (40,40,40), 3..15 = (60,60,60), 6-bit VGA DAC.
- **Centring uses C truncation.** `tstart=(639-width)/2` truncates toward zero (`Math.trunc`), so
  over-wide lines get a negative left-clipping margin.
- **Unmapped characters render as zero-width.** `ENDSCROL.TXT` uses `Y`, `Z`, `"`, `;` (and `\r`,
  `\t`) which have no glyph in `FONA_ORDER` (the uppercase run stops at `X`). The original simply has
  no `fonap`/`fonaw` entry for them, so they contribute nothing — reproduced verbatim.
- **The accented `é` collapses.** The 74-char order has the CP437 `0x8F` byte twice; both map to the
  same `é` key, so the glyph `Map` has 73 unique glyph keys (+ the forced space = 74). ASCII content
  is unaffected.
- **Visual check.** Frame 0 renders "Lerto has coded this hilariously fantastic" / "piece of
  non-interactive software" / "entertainment soon available to you all!" centred and legible;
  scrolling up by N px moves the content's top inked row up by N (verified in `raster.test.ts`).

## Modes

- authentic = chunky `NearestFilter` upscale of the 640×400 field.
- modern (default) = smooth `LinearFilter` upscale.

## Deferred / notes

- **Self-implemented decode/font/blit.** This branch is based on an earlier commit
  (`f47c818`) that predates `@sr/engine`'s shared `text/` (`decodeU`, `loadFona`, `buildFont`,
  `blitString`, `FONA_ORDER`) and `assets/` layers. The part therefore carries a self-contained,
  unit-tested copy of the `.U` decoder + font segmentation + scanline blit inside its own dir.
  **When the branch is rebased onto a commit that exports the engine text layer, switch
  `decode-u.ts`/`font.ts` to the engine API** (the engine `FONA_ORDER` is the ALKU variant; ENDSCRL's
  order differs only in the accented/`'` tail, which ASCII content never reaches, so either order
  yields identical layout for this scroll).
- **CREDITS variant not built.** `CREDITS/MAIN.C` is a *different* effect (per-picture credit cards
  sliding a split screen over 20 LBM backdrops with a 320×200 chunky font, FONAY=32). It shares only
  the FONA glyph sheet and the same segmentation. The shipped demo's closing scroll is ENDSCRL; the
  card variant would be a separate picture-card part if wanted later.
- **Local design/plan/STATUS docs.** `docs/superpowers/specs/`+`plans/` are excluded by the
  worktree's `.git/info/exclude`; these docs were force-added so the handoff notes are committed.

## Verification (observed)

`pnpm install`, `pnpm lint` (exit 0, no warnings), `pnpm typecheck` (clean), `pnpm test`
(132 passed, incl. 34 credits tests), `pnpm build` (worklet + packages + lab all built) — all green.

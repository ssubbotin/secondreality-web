# Part #20 — "Credits / greetings scroll" (ENDSCRL) — design

Slug: `credits` · Branch: `build/23-credits` · Original: `/home/sergey/SecondReality/ENDSCRL`
(`MAIN.C` + `ASMYT.ASM`); the greetings variant `/home/sergey/SecondReality/CREDITS/MAIN.C`.

## What the original does

`ENDSCRL/MAIN.C` is the closing **vertical text scroller**: a stream of horizontally centred text
lines drawn from the `FONA.UH` bitmap font, scrolling upward one pixel per frame. The scroll content
is `ENDSCROL.TXT` (newline-separated lines).

### Display mode and the wrap buffer

`main()` sets EGA mode `0Eh` (640×350 16-colour planar) and pokes CRTC register `09h` so the display
wraps. `setrgbpalette` writes the greyscale ramp: index 1 = (20,20,20), indices 2..15 =
(40,40,40)/(60,60,60) on the 0..63 VGA DAC; index 0 stays black (the background).

The scroll uses a **401-line circular buffer** in video memory: each frame writes the freshly
rendered scanline at both `80*yscrl` and `80*(yscrl+401)` (the doubled copy is the wrap mirror),
`setstart(yscrl*80 + 80)` repoints the CRTC start address, and `yscrl = (yscrl+1) % 401`. Net effect:
the whole image scrolls up one pixel per frame with a seamless wrap.

### The font (`FONA.UH`)

`FONA.UH` is the `.U`/`.UH` picture the converter `LBM2U.EXE` emits: a 10-byte header
(`magic=0xFCFC, wid=1500, hig=30, cols=256, add=49`), a 768-byte 6-bit VGA palette, 5 bytes of
metadata, then `1500×30` raw 8-bit palette indices. Ink values are **0..3** (a 2-bit font; measured
distinct values {0,1,2,3}).

`init()` (MAIN.C:97-125) segments glyph cells out of the 1500-wide sheet: scan left→right, a glyph is
a maximal run of columns with ≥1 non-zero pixel in any of the 30 rows, separated by all-empty
columns; the n-th run maps to the n-th char of
`fonaorder = "ABCDEFGHIJKLMNOPQRSTUVWXabc…xyz0..9!?,.:äö()+-*=åé"`. Space is forced:
`fonap[32]=1500-20, fonaw[32]=16`.

### Per-frame render (`do_scroll`, MAIN.C:60-96)

`line` cycles `0..29` (FONAY=30). On `line==0` a new text line is parsed from `tptr`:

```c
for(a=0,tstart=0,chars=0; *tptr!='\n'; a++,chars++) {
    textline[a]=*tptr; tstart += fonaw[*tptr++] + 2;
}
tstart=(639-tstart)/2;     // centring left-margin (C integer divide, truncates toward 0)
```

`tstart` first accumulates Σ(glyphWidth+2) = the rendered text width, then becomes the centred left
margin `(639 - width) / 2`. Each frame draws the font **row `line`** of every glyph into a 4-plane
scanline, `x` advancing `+2` between glyphs (the inter-glyph gap) and `+1` per glyph column. The ink
test ORs the 2-bit plane value (`mtau[x&7]` bit mask) — but because the scanline is freshly
`memset(0)` each frame and each pixel written once, the XOR equals a plain write of colour index =
ink level. So: **colour index written = font ink level (1..3)**.

Key fidelity facts:
- One **font scanline** emitted per frame; a full text line is 30 frames tall.
- Lines are packed with **no extra gap** — line N+1 starts the frame after line N's row 29.
- Horizontal layout is `measure(line)` wide, centred on column 319.5 via `(639-width)/2`.

## Port plan (faithful core + modern polish)

Render into a fixed **640×400** index field (the wrap height is 401; 400 tiles cleanly for the
demo's letterboxed window). Internally split pure logic from the GPU surface:

- **`decode-u.ts`** — port `decodeU` (the `.U`/`.UH` header + 6-bit palette + raw/RLE pixel block),
  self-contained because this worktree predates the engine text layer (deferred note).
- **`font.ts`** — port `init()`'s glyph segmentation (`buildFont` + `FONA_ORDER` + forced space) and
  `measure(text)` = Σ(glyphWidth+gap).
- **`scrolltext.ts`** — parse `ENDSCROL.TXT` into lines (`\n` separated; the original reads a line up
  to the first `\n`). Exposes `lineCount` / `lineAt`.
- **`layout.ts`** — `measureLine(font,line)` and `centerOffset(width) = trunc((639-width)/2)` (the C
  truncation, including the width>639 negative case).
- **`scroll.ts`** — `scrollAt(frame)` = frame (1px/frame), wrapped modulo the content height
  `lineCount*FONAY` so the scroll loops (default-loop playback); `rowToLineRow(globalRow)` →
  `{ lineIndex, fontRow }` via `floor(globalRow/30)` / `globalRow mod 30`.
- **`raster.ts`** — `rasterField(index, font, lines, scroll)` fills the `640×H` index buffer: each
  screen row maps to `globalRow = scroll + screenRow`, then blits that one font row of the centred
  line. Reproduces the original's "one scanline per frame, 30 rows per line, up 1px/frame" exactly,
  but draws the whole visible window each frame instead of a circular VGA buffer.
- **`palette.ts`** — the exact greyscale ramp from the original `setrgbpalette` calls (index 0 black;
  1 = 20; 2..15 = 40/60 on the 0..63 DAC).
- **`nodes.ts`** — `RasterSurface` (the proven index→sRGB-LUT DataTexture + `Blit` pattern): authentic
  = `NearestFilter` chunky upscale, modern = `LinearFilter` smooth upscale.
- **`credits.ts`** — the `Effect`: `SIM_HZ = 70` fixed-timestep accumulator advances `scroll` one
  pixel per sim step; `setMode` toggles the filter; renders into the supplied `RenderTarget`.

### Why not the CREDITS variant

`CREDITS/MAIN.C` is a *different* effect: per-picture credit cards (`screenin`) that slide a split
screen over 20 LBM backdrops with a 320×200 chunky font (FONAY=32). It shares only the FONA glyph
sheet and the same `init()` segmentation. The shipped demo's closing scroll is **ENDSCRL**, so this
part ports ENDSCRL; CREDITS is noted here for provenance but not built (a separate picture-card part).

## Tests (TDD, oracle-backed where possible)

1. `decode-u.test.ts` — decode the vendored `FONA.UH` fixture: header (1500×30), palette length,
   pixel-block size, ink values ⊆ {0,1,2,3}.
2. `font.test.ts` — segment FONA: glyph count, known glyph widths/positions, space cell
   (`x=1500-20, width=16`), `measure` against a hand-summed line.
3. `scrolltext.test.ts` — parse the `ENDSCROL.TXT` fixture: line count, first/last line, the
   font-test lines survive verbatim.
4. `layout.test.ts` — `centerOffset` truncation (positive and width>639 negative).
5. `scroll.test.ts` — `scrollAt` advance + wrap modulo content height; `rowToLineRow` at boundaries.
6. `raster.test.ts` — render a known short line into the field and assert its pixel footprint: ink
   only on expected rows/columns, centred, levels in {0..3}.

## Constraints honoured

TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`; no
`!`; explicit `.js`; `import type`; Biome 2-space/single-quote/width-100; no new deps; Unlicense.

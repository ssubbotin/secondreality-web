# ALKU II — the horizontal credit scroller (part #2)

Status: design. Slug `alku2`, branch `build/20-alku2`. Original: `/home/sergey/SecondReality/ALKU`
(`MAIN.C`, `ASMYT.ASM`, `COPPER.ASM`, `TWEAK.ASM`).

## What this part is

ALKU has two opening sections sharing one `main()` in `MAIN.C`:

1. **Part #1 — the static presentation cards** (`MAIN.C:61-77`): three centred cards fade in/out over a
   backdrop. Already shipped as `packages/parts/src/alku1/`.
2. **Part #2 — the horizontal scroller (THIS part)** (`MAIN.C:79-152`): once the cards finish, ALKU fades
   the HOI picture in and runs a **horizontal scroll** of the HOI backdrop while the FC credits scroll past
   as a **chunky XOR-plane text scroller**. The credits appear card by card (`Graphics / Marvel / Pixel`,
   `Music / Purple Motion / Skaven`, `Code / Psi / Trug / Wildfire`, `Additional Design / Abyss / Gore`),
   each rebuilt into the scroll buffer as it enters from the right.

This part ports section 2.

## Original mechanics (the truth)

The opening runs in a **tweaked mode-X**: `tw_opengraph` (`TWEAK.ASM:18-54`) sets CRTC offset register
`0x13 = 0x58` → a **176-byte (88-word) logical scanline** (640 px / 4 planes = 160 bytes visible + 16
slack), `crtc byte` + `400` + linecompare. Memory is unchained 4-plane; pixel `(x,y)` lives at byte
`y*176 + (x>>2)` in plane `x&3`.

### The backdrop scroll (`do_scroll`, `MAIN.C:397-412` + `COPPER.ASM`)

The HOI picture (`HOI.U` = 640×200, 256-colour `.U`) is loaded into vmem. `do_scroll` advances a pixel
counter `a` (1..320) and a page toggle `p` (0/1) each tick and posts two registers the copper ISR consumes:

- `cop_start = a/4 + p*88` — the CRTC display-start **byte** (which framebuffer byte scanline 0 begins at).
  The `/4` is the planar byte step; `p*88` flips between two 88-word pages.
- `cop_scrl = (a&3)*2` — the **horizontal pixel pan** (attribute controller reg `0x33`), 0/2/4/6 — the fine
  sub-byte scroll between byte steps.

`copper1` (`COPPER.ASM:64-81`) writes both per-frame. Net visible effect: the 640-wide HOI picture pans
**left by one pixel per tick** behind the text, wrapping its 320-pixel window across the source.

`do_scroll` also re-blits one fresh column of an "outline" decoration (`MAIN.C:405-409`, `outline` in
`ASMYT.ASM`) every 4 pixels; that is a per-page mode-X plane copy of a small graphic — a detail we fold into
the backdrop scroll (see Approximations).

### The text scroller (`maketext` / `scrolltext` / `ascrolltext`)

Credit lines are stamped into a chunky **`tbuf[186][352]`** byte buffer by `addtext`/`faddtext`
(`MAIN.C:324-340, 417-434`): centred on x=160, each glyph's 2-bit ink (`font[y][...]` already remapped to
`0x40/0x80/0xC0` plane bytes in `init`) written to `tbuf[y+ty][tx+x-w]`.

`maketext`/`fmaketext` (`MAIN.C:343-371, 436-469`) precompute a **delta list** `dtau`: per plane `m`, for
columns `x≡m (mod 4)`, rows `y∈[1,184)`, where `tbuf[y][x] != tbuf[y][x-2]` it records
`(x/4 + y*176 + 100*176, tbuf[y][x]^tbuf[y][x-2])`. `ascrolltext` (`ASMYT.ASM:12-54`) then **XORs** those
deltas into vmem at the scrolled position. Because XOR of successive column differences telescopes, the net
displayed byte at planar column `c`, row `y` equals `tbuf[y][2c]` — i.e. **the scroller simply renders
`tbuf` translated horizontally by the scroll offset.** The XOR delta trick is a DOS speed hack for cheap
horizontal scroll; the *visible result* is a plain horizontal scroll of the chunky text buffer.

`do_scroll(mode)`: gated on `frame_count >= SCRLF` (=9 vblanks per scroll step); `mode==1` calls
`ascrolltext(a + p*352, dtau)` (the page-offset scroll), then advances `a`, toggles `p`.

### Timing

`SCRLF = 9` (`MAIN.C:7`) vblanks per scroll step; the section scrolls `a` from 1 to ~320 across the four
credit cards, gating new cards on `dis_sync` (the music order). The text region sits at rows `100..283`
(`100*176` offset, 184 rows tall), bottom-half of the 400-line virtual screen.

## The port (faithful core + modern polish)

We render the **visible result**, not the XOR plane hack, into a 320×200 palette-index buffer resolved
through a 6-bit VGA palette LUT — the same `RasterSurface` pattern as `alku1`/`forest`/`endpic`.

### Pure, unit-tested logic (the `*.test.ts` half)

- **`text-buffer.ts`** — `addText(tbuf, font, cx, ty, text)` ports `addtext` (`MAIN.C:324-340`): centred
  chunky stamp of FONA glyphs into the 352×186 `tbuf`, ink level → plane byte `level*0x40`. Plus
  `TBUF_W=352`, `TBUF_H=186`.
- **`scroll.ts`** — the scroll state machine. `CreditCard[]` (the four cards, `MAIN.C:103-128`), the
  `SCRLF=9` cadence, and `scrollAt(frame)` → `{ scroll, card }`. Pure, deterministic, looping.
- **`copper.ts`** — the backdrop horizontal pan: `backdropOffset(frame)` (pixel pan into the HOI source) and
  the per-pixel sample of the 640-wide HOI index buffer windowed to 320. Tested for wrap + advance.
- **`compose.ts`** — `composeFrame(dst, hoi, tbuf, scroll, backdropOffset)`: lay the HOI window across the
  320×200 field, then OR the scrolled `tbuf` text band on top. Pure; tested for content + scroll
  translation.

### GPU nodes (mirrors alku1)

- **`nodes.ts`** — `RasterSurface`: 320×200 index buffer → 6-bit palette LUT (×4) → sRGB `DataTexture` →
  `Blit` into the supplied `RenderTarget`. `NearestFilter` (authentic chunky) ↔ `LinearFilter` (modern).

### The Effect

- **`alku2.ts`** — `Alku2 implements Effect` with `setMode('authentic'|'modern')`, a fixed **70 Hz**
  accumulator (`SIM_HZ=70`, the mode-X vblank cadence; one scroll step every `SCRLF=9` sim frames),
  rendering into the supplied target, full dispose teardown. `load()` fetches `FONA.UH` (font) and `HOI.U`
  (backdrop) via the engine `.U` decoder; `init()` builds the surface and the `tbuf` for all cards.

### Authentic ↔ modern

Authentic: the chunky 320×200 field with `NearestFilter`. Modern: `LinearFilter` smooth upscale, same
content. Both share the CPU raster → index buffer → palette LUT pipeline (no separate modern renderer needed
for a 2-D scroller; the difference is the upscale filter, matching the alku1/forest convention).

## Approximations (documented, faithful-core)

1. **XOR plane hack → direct translate.** We render the telescoped *result* (a plain horizontal scroll of
   the chunky text buffer), not the per-plane XOR delta writes. Visible output is identical; the hack was a
   286-era speed trick with no modern equivalent or observable difference.
2. **`outline` decoration.** The small per-column outline blit (`MAIN.C:405-409`) is a DOS plane-copy of a
   bordered strip around the picture; we fold the HOI backdrop in directly without the separate outline
   plane. It is a thin frame detail, not a distinct effect element.
3. **Two-page flip → single field.** The `p` page toggle and `p*88`/`p*352` page offsets are double-buffer
   bookkeeping; we composite one field per frame. No visible difference.
4. **`dis_sync` card gating → deterministic schedule.** Like `alku1`, the original gates each new credit
   card on the music order (`dis_sync`); we run the four cards on the fixed-timestep schedule keyed to the
   scroll position (each card enters at a scroll offset spaced like the original `a<320` march), so the lab
   loop is reproducible and fps-independent. The four cards and their text are verbatim from `MAIN.C`.
5. **Text region placement.** The original text band is rows 100..283 of a 400-line virtual screen; the
   viewer sees the split-screen lower half scrolling. We place the chunky text band centred vertically in
   the 200-line visible field.

## Citations

- Scroller core: `ALKU/MAIN.C` `do_scroll` (397-412), `maketext` (343-371), `fmaketext` (436-469),
  `addtext` (324-340), `faddtext` (417-434), the credit cards (103-128).
- XOR plane scroll: `ALKU/ASMYT.ASM` `ascrolltext` (12-54), `outline` (56-108).
- Backdrop CRTC scroll + palette fade: `ALKU/COPPER.ASM` `copper1`/`copper2`/`copper3`.
- Mode-X geometry: `ALKU/TWEAK.ASM` `tw_opengraph` (18-54), 176-byte stride.
- Assets: `HOI.U` (640×200 `.U`), `FONA.UH` (1500×30 glyph sheet) — engine `decodeU`/`loadFona`.
</content>

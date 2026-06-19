# ALKU II (`alku2`) — STATUS / handoff

Part #2 "Opening texts II" — the ALKU horizontal credit scroller. Branch `build/20-alku2`. **CI-green,
un-wired.** Original: `/home/sergey/SecondReality/ALKU` (`MAIN.C`, `ASMYT.ASM`, `COPPER.ASM`, `TWEAK.ASM`).

## What shipped

`packages/parts/src/alku2/`:

- `font.ts` — **local** `.U`/`.UH` decoder (`decodeU`) + FONA segmentation (`buildFont`/`loadFona`,
  `BitmapFont`). Vendored here because this branch's engine commit predates the engine `text/`+`assets/`
  layer (see Deferred). Ported from `MAIN.C init()` segmentation; format verified against FONA.UH/HOI.U.
- `text-buffer.ts` — `addText` (port of `MAIN.C addtext`): centred chunky glyph stamp into the 352×186
  `tbuf`, ink level → plane byte `level*0x40` (`MAIN.C:169-182`).
- `scroll.ts` — the four FC credit cards verbatim (`MAIN.C:103-128`), `SCRLF=9` cadence, `scrollAt(frame)`.
- `copper.ts` — HOI backdrop horizontal pan (`do_scroll` `cop_start`/`cop_scrl`, `COPPER.ASM copper1`):
  `backdropOffset` + `sampleBackdropRow` (640→320 window, wrapping).
- `palette.ts` — `buildAlku2Palette`: ports `MAIN.C:184-209` `palette2` (picture band 0..63, text bands
  1/2/3 blended toward ink colours 1/2/3 via `(ink*63 + base*(63-ink))>>6`).
- `compose.ts` — `composeFrame`: HOI window + OR'd scrolled text band into the 320×200 index buffer.
- `nodes.ts` — `RasterSurface` (index → 6-bit LUT ×4 → sRGB DataTexture → `Blit`), Nearest/Linear toggle.
- `alku2.ts` — `Alku2 implements Effect` + `setMode`, 70 Hz accumulator, renders into the supplied target,
  full dispose teardown. `index.ts` re-exports for direct test/lab import.
- `__fixtures__/FONA.UH`, `__fixtures__/HOI.U` — vendored originals for byte-exact tests.

Assets: `apps/lab/public/pics/FONA.UH`, `apps/lab/public/pics/HOI.U`.

## Verification (observed)

`pnpm lint` clean · `pnpm typecheck` clean · `pnpm test` 146 passed (28 files; 51 new alku2 tests) ·
`pnpm build` OK (worklet + all packages + lab).

## Fidelity findings

- **The XOR plane scroller telescopes to a plain translate.** `maketext` records per-column XOR deltas
  (`tbuf[y][x]^tbuf[y][x-2]`) and `ascrolltext` XORs them into vmem; the running XOR reconstructs the
  original column bytes, so the *visible* result is `tbuf` translated horizontally. We render that result
  directly — byte-identical output, no 286-era plane hack needed.
- **HOI uses only the low 64-colour band.** The shipped `HOI.U` pixels span indices 0..52; the text overlay
  ORs plane bytes `0x40/0x80/0xC0` to reach the lit bands, exactly as the original. The on-disk HOI palette
  high bands are white placeholders — `MAIN.C init()` rebuilds them at runtime (`palette2`), which we port.
- **Mode-X stride is 176 bytes** (CRTC offset `0x58`=88 words), 640px/4 planes + 16-byte scroll slack — the
  source of the `176*100` text offsets and the `a/4 + p*88` page math. Folded into the 640→320 windowing.
- **Palette LUT must be sRGB** (`SRGBColorSpace`) so the 6-bit VGA DAC bytes (×4) land verbatim — same as
  alku1/forest/endpic.

## Approximations (documented in the design doc)

XOR hack → direct translate; `outline` frame decoration folded into the backdrop; two-page flip → single
field; `dis_sync` card gating → deterministic scroll-keyed schedule (the four cards + text are verbatim);
text band centred vertically in the 200-line field (the original split-screen lower half).

## Deferred

- **Engine text/asset layer.** This branch's engine commit has no `decodeU`/`loadFona`/`blitString` or LBM
  decoder, so they are implemented **locally** in `alku2/font.ts` (self-contained + tested). When this part
  is rebased onto an engine that exports the text layer (as `alku1` uses), swap `./font.js` for `@sr/engine`
  and delete the local copy — the API matches (`decodeU`, `loadFona`, `BitmapFont`, `buildFont`,
  `FONA_ORDER`).
- **`HOIKKA.LBM` overlay.** The task notes HOIKKA.LBM (an ILBM extra) "via the ILBM decoder if available
  else defer". No engine ILBM decoder on this branch and it is not part of the core scroller mechanic, so
  it is deferred; the scroller backdrop uses `HOI.U` (the `.U`-decodable picture), which is what `do_scroll`
  scrolls.

## Wiring (when integrating)

`packages/parts/src/index.ts` is intentionally **not** touched (part stays un-wired). To wire: add
`export { Alku2 } from './alku2/alku2.js';` and register a cue. Lab: mount `new Alku2()`; `setMode` toggles
authentic↔modern.
</content>

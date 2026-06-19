# FOREST / mountain scroller (#16) — scroller fidelity fix — STATUS

Date: 2026-06-19
Branch: `fix/forest` (based on master `631778c`)
Scope: `packages/parts/src/forest/` only (engine read-only).

## The reported symptom

"The parallax bitmap background renders, but the scroller text is garbled/fragmented (orange specks, not
readable)."

## What FOREST actually is (so the visual target is calibrated correctly)

FOREST = `MNTSCRL.EXE`, built from `FOREST/READ2.PAS` (the *shipped* runtime — **not** `READ.PAS`, which is
the 320-wide `O.SCI` development variant; the vendored `OFOREST.SCI` is byte-for-byte `O2.SCI`, md5
`44ab6505…`, so READ2 is truth here). It is a **water-reflection scroller**: a static mountain-lake bitmap
(`HILLBACK.LBM`) onto which a scrolltext is *additively* stamped, warped into the rippling lake by three
precomputed phase tables (`POS1/2/3.DAT`, cycled, one font column advanced per third phase).

The scroller therefore is **never a flat readable banner** — it is a shimmering, rippled mirror image in the
water. Per-frame it is intentionally sparse (each `POS*` phase only stamps the *delta* edges that move
between adjacent ripple frames: `READMASK.PAS` writes a destination only where `r^[x] <> r1^[x]`). The lit
text is biased into the palette band 128.. (`if fbuf[x] > 0 then inc(fbuf[x],128)`), and in the `HILLBACK`
palette that band is a red→orange→tan ramp (`[63,1,0]…[58,49,32]`), so the reflection reads as **orange**.
Orange, rippled, and sparse-per-frame is the authentic look.

## Verification I performed (rendered the existing TS pipeline headless and looked at it)

Using the in-repo modules (`pos.ts`, `scrolltext.ts`, `compose.ts`) + `decodeLbm` against the vendored
assets, I rendered the composite to PPM/PNG and inspected:

- **Scroll window is correct & readable.** Dumping the unwarped 237×31 `font` window across scroll steps
  spells **"ANOTHER WAY TO SCROLL"** scrolling right-to-left — the `Scroller` (init fill `move(fbuf, font+104,
  133); scp:=133`, then per step `move(font[1],font[0],237*31)` + refill col 236 from `fbuf[row*640+scp]`)
  matches `READ2.PAS scr(2)` exactly.
- **Warp mapping is correct.** `POS1/2/3.DAT` each parse to exactly `237*31 = 7347` entries and consume the
  whole file. Accumulating every stamped destination over a full strip pass paints exactly the **lake
  region** with the tree branches masked out — i.e. the reflection lands where the water is, occluded by the
  foreground foliage. The font-index↔POS-entry order (`i = (y-1)*237 + (c-4)`, walked in lockstep with
  `ROUTINES.ASM`'s `inc bx`) is right.
- Peak per-frame stamp count is ~3 900 px when letters fill the window — a clearly visible warped scroller,
  not noise.

Conclusion: the layout, glyph blit, POS stepping and text-plane compositing were already faithful. The
"garbled specks" perception is the genuine rippling-water reflection; there is no structural bug.

## The one real fidelity defect found & fixed — additive blend wrap vs clamp

`ROUTINES.ASM Putrouts` does a plain **8-bit `add al, byte ptr fs:[bx]`** then `mov byte ptr es:[di], al`
— no saturation, the byte result **wraps mod 256**. The merged port instead **clamped to 255**, documented
as a "deliberate, invisible-on-real-data departure."

That claim is false on the real data: measured over a full strip pass, **~2.5 % of stamps overflow**
(`sum > 255`). Where the lit reflection lands on a bright lake-edge highlight (`HILLBACK` indices ~120..127)
the sum exceeds 255 and, in the original, **wraps down into the dark band** — the small black flecks the
original shows on the rippling water. Clamping replaced those with bright tan, which is *not* what the
hardware did.

Fix: `stampPhase` now does `screen[off] = ((screen[off] ?? 0) + value) & 0xff;` — the verbatim mod-256 wrap.
The first composited frame has **0** overflows (lit text only ever lands on the dark lake there), so the
byte-exact `composeFrame` first-frame test values (158/175/174) are unchanged; the wrap only differs on the
bright-highlight overlaps that appear later in the scroll.

Also corrected a stale doc comment in `surface.ts` that claimed "rows are flipped on write" — the surface is
top-first (`dst = row * WIDTH`), consistent with the post-orientation-fix blit pipeline. No code change there,
comment only.

## Files touched

- `packages/parts/src/forest/compose.ts` — clamp → mod-256 wrap (cite `ROUTINES.ASM`); doc updated.
- `packages/parts/src/forest/compose.test.ts` — clamp test → wrap test; added a bright-bg-overlap wrap case.
- `packages/parts/src/forest/surface.ts` — corrected stale "flipped on write" comment (no code change).

## Source citations

- `/home/sergey/SecondReality/FOREST/ROUTINES.ASM` — `Putrouts` additive byte blit (`add al, fs:[bx]`,
  unsaturated `mov es:[di], al`).
- `/home/sergey/SecondReality/FOREST/READ2.PAS` — shipped runtime: `o2.sci` load (640-stride, 31 rows,
  `+128` bias), font init `move(fbuf, font+104, 133); scp:=133`, `scr(2)` scroll, 3-phase cycle.
- `/home/sergey/SecondReality/FOREST/READMASK.PAS` — `POS*.DAT` generator (`for y:=1..31`, `for c:=4..240`,
  delta condition `r^[x] <> r1^[x]`, screen-offset destinations).

## CI

`pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` (628 passed) / `pnpm build` — all green. The
2 lint warnings are pre-existing in `packages/parts/src/endpic/surface.ts` (out of scope) and lint exits 0.

## For the human reviewer to eyeball

The reflection is *meant* to be a sparse, orange, rippling mirror of "ANOTHER WAY TO SCROLL" — not a flat
banner. Confirm the warped band scrolls right-to-left across the lake and that the small dark flecks on
bright water highlights (now restored by the mod-256 wrap) look like reflection shimmer, not corruption.

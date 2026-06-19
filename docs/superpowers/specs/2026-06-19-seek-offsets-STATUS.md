# STATUS — real per-part music-seek offsets (lab preview wiring)

Branch: `task/seek-offsets` (based on `76a5f02`). Touches only `apps/lab/src` (preview-only).

## What changed

- `apps/lab/src/seek-offsets.ts` (new) — the derived `{ moduleUrl, seek, note }` table for every part,
  with the full derivation in the file header.
- `apps/lab/src/effects.ts` — the `EFFECTS` map now pulls `moduleUrl`+`seek` from that table via a tiny
  `seekOf()` helper instead of carrying placeholder `seek:0` / best-guess modules. Same 20 keys, same
  `EffectDef` shape; `main.ts` is untouched (it already reads `def.moduleUrl`/`def.seek` generically).

## How the offsets were derived (source of truth: `/home/sergey/SecondReality`)

The demo never seeks the soundtrack per part. `MAIN/U2.ASM` (`@@partsagain`) launches the part EXEs in a
fixed order and plays each S3M straight through; parts hand off at the music's `+++` sync markers (polled
via `dis_musplus()` / `dis_muscode()`, DIS service 6 — `DIS/DISINT.ASM:242`). So a part's "start position"
is just the song-time at which the previous part hands it the screen.

1. **Which module — EXACT.** From `U2.ASM`'s `restartmus` calls (`ax` = module index, `0`=MUSIC0,
   `1`=MUSIC1) and the launch order. Full default run:
   - intro `ALKU / U2A / PAM / BEGLOGO` → **MUSIC0** from order 0;
   - `GLENZ → TUNNELI → TECHNO → PANICEND`, then the entire middle
     (`MNTSCRL, LNS&ZOOM, PLZPART, MINVBALL, RAYSCRL, 3DSINFLD, JPLOGO`) → **MUSIC1**
     (`restartmus ax=1,bx=0`). The MUSIC0 `bx=42` restart guarding the middle only fires when the demo is
     *started at* that group from the command line; in a full run the middle keeps playing MUSIC1
     (`U2.ASM:858` — `test whattorun,2; jnz @@con3`). This corrects the earlier guess that the
     lens/rotozoomer/plasma/comanche block runs under MUSIC0.
   - `U2E` (Vector II) → **MUSIC0** `restartmus ax=0,bx=18`; `DDSTARS` (hidden) → **MUSIC0** `bx=70`;
     `ENDLOGO/CRED/ENDSCRL` continue on MUSIC0 after U2E.

2. **Start seconds.** Simulated each S3M's order list with its speed/tempo effects
   (`seconds_per_row = speed * 2.5 / BPM`, the ScreamTracker-3 `BPM*2/5` tick rate the engine already uses
   in `sync/mframe.ts`). MUSIC0's initial tempo is patched to `0x78` (120 BPM) by `STARTMUS.C`
   (`module[50]=0x78`) when the demo loads it, so 120 BPM is used for MUSIC0.
   - **restartmus order anchors (EXACT):** MUSIC0 order 18 = 128.00s, order 70 = 576.71s.
   - **MUSIC0 intro order grid:** 8.00s/order at spd6/120BPM (orders 0/2/4/6/15 = 0/16/32/48/120s).
   - **MUSIC1 `+++` markers (the middle hand-off points), order→seconds:**
     `3→11.08 14→48.00 19→62.77 25→81.23 27→84.92 38→121.85 41→129.23 46→158.77 49→166.15
     61→206.77 67→243.69 76→273.23 87→310.15`.
   - **Calibration:** TECHNO is the 3rd MUSIC1 part; an earlier audio cross-correlation put it ~77s in,
     which lands on the order-25 marker (81.23s) — that pins the marker→part assignment for the middle.

## Per-part confidence

| Part | Module | Seek (s) | Confidence | Basis |
|---|---|---|---|---|
| alku1 | MUSIC0 | 0 | **exact** | ALKU at song start (order 0) |
| alku2 | MUSIC0 | 16 | approx (order grid) | MUSIC0 order 2 |
| alku3 | MUSIC0 | 32 | approx (order grid) | MUSIC0 order 4 |
| vector1 | MUSIC0 | 48 | approx (order grid) | MUSIC0 order 6 (U2A ship vector) |
| endpic | MUSIC0 | 120 | approx (order grid) | MUSIC0 order 15 (BEGLOGO title flash) |
| glenz | MUSIC1 | 0 | **exact** | GLENZ as MUSIC1 starts (`restartmus ax=1,bx=0`) |
| dottunnel | MUSIC1 | 63 | approx (+++ marker) | order 19 |
| techno | MUSIC1 | 81 | approx (+++ marker, calibrated) | order 25 (~77s anchor) |
| panic | MUSIC1 | 85 | approx (+++ marker) | order 27 (bang/shrink after TECHNO) |
| forest | MUSIC1 | 122 | approx (+++ marker) | order 38 (MNTSCRL) |
| lens | MUSIC1 | 129 | approx (+++ marker) | order 41 (LNS&ZOOM, lens half) |
| rotozoomer | MUSIC1 | 159 | approx (+++ marker) | order 46 (LNS&ZOOM, zoomer half) |
| plasma | MUSIC1 | 166 | approx (+++ marker) | order 49 (PLZPART, plasma half) |
| plasmacube | MUSIC1 | 207 | approx (+++ marker) | order 61 (PLZPART, cube half) |
| minivectorballs | MUSIC1 | 244 | approx (+++ marker) | order 67 (MINVBALL) |
| water | MUSIC1 | 273 | approx (+++ marker) | order 76 (RAYSCRL) |
| comanche | MUSIC1 | 310 | approx (+++ marker) | order 87 (3DSINFLD) |
| vector2 | MUSIC0 | 128 | **exact** | `restartmus ax=0,bx=18` → order 18 |
| ddstars | MUSIC0 | 577 | **exact** | `restartmus ax=0,bx=70` → order 70 (576.71s) |
| credits | MUSIC0 | 185 | approx | ENDLOGO/CRED group; MUSIC0 order 25 (standalone-entry anchor) |

## Notes / follow-ups

- The module assignment is exact for all parts; the per-part seconds within MUSIC1 are pinned to the
  correct module + the right region of the song, but the exact `+++` marker chosen for adjacent parts that
  share an EXE (lens/rotozoomer, plasma/plasmacube) is the best-supported guess and could shift by one
  marker. A frame-accurate pass would emulate the demo and read `np_ord`/`np_row` at each part's first
  `dis_musplus()` return; that is out of scope for preview wiring.
- `credits` 185s is the standalone `restartmus bx=25` anchor; in a full run CRED continues on MUSIC0 after
  U2E rather than restarting, so its true position is later — marked approximate.
- No `Zxx` muscode commands exist in either module (verified by scanning the de-obfuscated patterns), so
  `dis_muscode(0xf0)` waits (e.g. BEGLOGO/endpic) fall through to their frame-count loops; the parts are
  effectively gated by the `+++` markers, which is what the table uses.

// Per-part music module + start position, recovered from the ORIGINAL DIS sequencing.
//
// The 1993 demo never seeks the soundtrack per part: MAIN/U2.ASM plays each module straight through
// and the parts hand off to one another at the music's sync points (the +++ markers in the S3M order
// list, polled via dis_musplus()/dis_muscode()). A part's "start position" is therefore simply the
// song-time at which the previous part hands it the screen. We reproduce that timeline here so the lab
// previews each part from the same spot in the song the demo would.
//
// Derivation (all from /home/sergey/SecondReality):
//
//   1. WHICH MODULE — exact, from MAIN/U2.ASM's restartmus calls (ax = module index: 0=MUSIC0,
//      1=MUSIC1) and the @@partsagain part-launch order. In a full default run:
//        - intro (ALKU/U2A/PAM/BEGLOGO)                        -> MUSIC0, played from order 0
//        - GLENZ -> TUNNELI -> TECHNO -> PANICEND, then the
//          whole middle (MNTSCRL,LNS&ZOOM,PLZPART,MINVBALL,
//          RAYSCRL,3DSINFLD,JPLOGO)                            -> MUSIC1, restartmus ax=1,bx=0
//          (the MUSIC0 bx=42 restart before the middle only fires when you start the demo *at* that
//           group from the command line; in a full run the middle keeps playing MUSIC1 — U2.ASM:858)
//        - U2E (Vector Part II / KewlComplex city)             -> MUSIC0, restartmus ax=0,bx=18
//        - DDSTARS (hidden part)                               -> MUSIC0, restartmus ax=0,bx=70
//        - ENDLOGO/CRED/ENDSCRL                                -> continue MUSIC0 after U2E
//
//   2. START SECONDS — computed by simulating each S3M's order list with its speed (ticks/row, 'A')
//      and tempo (BPM, 'T') effects: seconds_per_row = speed * 2.5 / BPM (ScreamTracker-3 timing,
//      the same BPM*2/5 tick rate the engine's sync/mframe.ts uses). MUSIC0's initial tempo is patched
//      to 0x78 (120 BPM) by STARTMUS.C (`module[50]=0x78`) when the demo loads it, so we use 120.
//        - restartmus order anchors (EXACT):  MUSIC0 order 18 = 128.00s, order 70 = 576.71s.
//        - MUSIC0 intro order grid (8.00s/order at spd6/120BPM): order 0/2/4/6/15 = 0/16/32/48/120s.
//        - MUSIC1 +++ markers (the middle-section hand-off points), order -> seconds:
//             3->11.08  14->48.00  19->62.77  25->81.23  27->84.92  38->121.85  41->129.23
//            46->158.77 49->166.15 61->206.77 67->243.69 76->273.23 87->310.15 ...
//      Calibration: TECHNO is the 3rd MUSIC1 part and a long cross-correlation earlier put it ~77s in;
//      that lands on the order-25 marker (81.23s), which fixes the marker->part assignment below.
//
// CONFIDENCE
//   exact        — module + seconds both pinned by a restartmus order anchor (vector2, ddstars) or by
//                  the module load itself (alku1/glenz at song start).
//   approx-order — module exact; seconds from the MUSIC0 intro order grid (alku2/alku3/vector1/endpic).
//   approx-marker— module exact; seconds = the +++ marker for the part's execution rank in MUSIC1.
//
// This is preview-only wiring; see docs/superpowers/specs for the full STATUS write-up.

export const MUSIC0 = '/music/MUSIC0.S3M';
export const MUSIC1 = '/music/MUSIC1.S3M';

export interface SeekOffset {
  moduleUrl: string;
  /** Start position within the module, in seconds. */
  seek: number;
  /** One-line derivation note (cited in effects.ts per part). */
  note: string;
}

export const SEEK_OFFSETS: Record<string, SeekOffset> = {
  // ---- MUSIC0 intro (played from order 0; orders are 8.00s apart at spd6/120BPM) ----
  alku1: { moduleUrl: MUSIC0, seek: 0, note: 'exact: ALKU at MUSIC0 song start (order 0)' },
  alku2: {
    moduleUrl: MUSIC0,
    seek: 16,
    note: 'approx-order: MUSIC0 order 2 (2nd intro text fade)',
  },
  alku3: {
    moduleUrl: MUSIC0,
    seek: 32,
    note: 'approx-order: MUSIC0 order 4 (3rd intro text fade)',
  },
  vector1: {
    moduleUrl: MUSIC0,
    seek: 48,
    note: 'approx-order: MUSIC0 order 6 (U2A intro ship vector)',
  },
  endpic: {
    moduleUrl: MUSIC0,
    seek: 120,
    note: 'approx-order: MUSIC0 order 15 (BEGLOGO title flash, end of intro)',
  },

  // ---- MUSIC1 middle (restartmus ax=1,bx=0; seconds = +++ marker per execution rank) ----
  glenz: {
    moduleUrl: MUSIC1,
    seek: 0,
    note: 'exact: GLENZ as MUSIC1 starts (restartmus ax=1,bx=0)',
  },
  dottunnel: {
    moduleUrl: MUSIC1,
    seek: 63,
    note: 'approx-marker: MUSIC1 +++ order 19 (after GLENZ)',
  },
  techno: {
    moduleUrl: MUSIC1,
    seek: 81,
    note: 'approx-marker: MUSIC1 +++ order 25 (~77s cross-corr anchor)',
  },
  panic: {
    moduleUrl: MUSIC1,
    seek: 85,
    note: 'approx-marker: MUSIC1 +++ order 27 (bang/shrink after TECHNO)',
  },
  forest: {
    moduleUrl: MUSIC1,
    seek: 122,
    note: 'approx-marker: MUSIC1 +++ order 38 (MNTSCRL mountain scroller)',
  },
  lens: {
    moduleUrl: MUSIC1,
    seek: 129,
    note: 'approx-marker: MUSIC1 +++ order 41 (LNS&ZOOM, lens half)',
  },
  rotozoomer: {
    moduleUrl: MUSIC1,
    seek: 159,
    note: 'approx-marker: MUSIC1 +++ order 46 (LNS&ZOOM, zoomer half)',
  },
  plasma: {
    moduleUrl: MUSIC1,
    seek: 166,
    note: 'approx-marker: MUSIC1 +++ order 49 (PLZPART, plasma half)',
  },
  plasmacube: {
    moduleUrl: MUSIC1,
    seek: 207,
    note: 'approx-marker: MUSIC1 +++ order 61 (PLZPART, cube half)',
  },
  minivectorballs: {
    moduleUrl: MUSIC1,
    seek: 244,
    note: 'approx-marker: MUSIC1 +++ order 67 (MINVBALL)',
  },
  water: {
    moduleUrl: MUSIC1,
    seek: 273,
    note: 'approx-marker: MUSIC1 +++ order 76 (RAYSCRL raytrace scroll)',
  },
  comanche: {
    moduleUrl: MUSIC1,
    seek: 310,
    note: 'approx-marker: MUSIC1 +++ order 87 (3DSINFLD 3D sinus field)',
  },

  // ---- MUSIC0 tail (exact restartmus order anchors) ----
  vector2: {
    moduleUrl: MUSIC0,
    seek: 128,
    note: 'exact: restartmus ax=0,bx=18 -> MUSIC0 order 18 = 128.00s',
  },
  ddstars: {
    moduleUrl: MUSIC0,
    seek: 577,
    note: 'exact: restartmus ax=0,bx=70 -> MUSIC0 order 70 = 576.71s',
  },
  credits: {
    moduleUrl: MUSIC0,
    seek: 185,
    note: 'approx: ENDLOGO/CRED group, MUSIC0 order 25 = 185.00s (standalone-entry anchor)',
  },
};

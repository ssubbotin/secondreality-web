const trunc = Math.trunc;

export interface PhaseState {
  kind: 'A' | 'B';
  rot: number;
  vm: number;
  vma: number;
  rota: number;
}

/** doit1 initial state (KOE.C:344,347). */
export function initPhaseA(): PhaseState {
  return { kind: 'A', rot: 45, vm: 50, vma: 0, rota: 0 };
}

/** doit2 initial state (KOE.C:403,406). vm base is 100*64. */
export function initPhaseB(): PhaseState {
  return { kind: 'B', rot: 50, vm: 100 * 64, vma: 0, rota: 10 };
}

/** Advance one fixed (≈70 Hz) sim step, mirroring the C per-frame update for the phase. */
export function stepPhase(s: PhaseState): PhaseState {
  const n: PhaseState = { ...s };
  if (s.kind === 'A') {
    n.rot = s.rot + 2;
    n.vm = s.vm + s.vma;
    if (n.vm < 25) {
      n.vm -= s.vma;
      n.vma = -s.vma;
    }
    n.vma = n.vma - 1;
  } else {
    n.rot = s.rot + trunc(s.rota / 10);
    n.vm = s.vm + s.vma;
    if (n.vm < 0) {
      n.vm -= s.vma;
      n.vma = -s.vma;
    }
    n.vma = n.vma - 1;
    n.rota = s.rota + 1;
  }
  return n;
}

/**
 * The `vm` value to feed barQuads. doit2 (phase B) scales velocity by `vm/64` (KOE.C:419-420) with
 * `vm` initialised to 100*64, whereas doit1 (phase A) uses `vm` directly (KOE.C:360). Normalising
 * here keeps barQuads a single `vx*vm/100` formula; without it phase B's bars are 64× oversized.
 */
export function effectiveVm(s: PhaseState): number {
  return s.kind === 'B' ? trunc(s.vm / 64) : s.vm;
}

/** curpal-style beat flash: decays one level per step toward 0. */
export function beatFlashDecay(level: number): number {
  return level > 0 ? level - 1 : 0;
}

/** The flash level set when a beat row is hit (KOE.C:43 `curpal=15`). */
export const BEAT_FLASH_LEVEL = 15;

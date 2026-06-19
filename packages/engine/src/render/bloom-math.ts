/**
 * Pure math for the modern bloom post-process. Kept free of any GPU type so the kernel and
 * threshold curve can be unit-tested in the node test environment; `bloom.ts` bakes these numbers
 * into the TSL fullscreen passes.
 */

/** A single separable-blur tap: a texel offset along one axis and its (normalised) weight. */
export interface BlurTap {
  /** Offset in texels from the centre sample (negative = toward 0). */
  offset: number;
  /** Normalised weight; the full tap list sums to 1. */
  weight: number;
}

/**
 * One-sided Gaussian weights w[0..radius] for the given sigma (w[0] is the centre tap). Not
 * normalised — `blurKernel` symmetrises and normalises. Sigma defaults to radius/2, the usual
 * "weights fall to ~e^-2 at the kernel edge" choice that keeps a visible but soft falloff.
 */
export function gaussianWeights(radius: number, sigma = radius / 2): number[] {
  if (!Number.isInteger(radius) || radius < 1) {
    throw new RangeError(`bloom blur radius must be a positive integer, got ${radius}`);
  }
  if (!(sigma > 0)) throw new RangeError(`bloom blur sigma must be > 0, got ${sigma}`);
  const denom = 2 * sigma * sigma;
  const w: number[] = [];
  for (let i = 0; i <= radius; i++) w.push(Math.exp(-(i * i) / denom));
  return w;
}

/**
 * Build the full symmetric, normalised separable-blur kernel as a tap list spanning
 * [-radius, +radius]. The returned weights sum to 1 (within float epsilon), so a blur pass that
 * accumulates `sum += sample(uv + tap.offset*texel) * tap.weight` preserves total brightness.
 */
export function blurKernel(radius: number, sigma = radius / 2): BlurTap[] {
  const half = gaussianWeights(radius, sigma);
  // total = centre + both wings
  let total = half[0] ?? 0;
  for (let i = 1; i <= radius; i++) total += 2 * (half[i] ?? 0);
  if (!(total > 0)) throw new RangeError('bloom blur kernel summed to zero');
  const taps: BlurTap[] = [];
  for (let i = radius; i >= 1; i--) taps.push({ offset: -i, weight: (half[i] ?? 0) / total });
  taps.push({ offset: 0, weight: (half[0] ?? 0) / total });
  for (let i = 1; i <= radius; i++) taps.push({ offset: i, weight: (half[i] ?? 0) / total });
  return taps;
}

/**
 * Soft-knee bright-pass response for a single channel/luma value. Below `threshold - knee` the
 * value is fully suppressed (0); above `threshold + knee` it passes through unchanged; in the knee
 * band it ramps smoothly (smoothstep), which avoids a hard ringing edge on near-threshold pixels.
 * Returns the value to KEEP for the glow source (not a 0..1 mask) so callers can feed it straight
 * into the additive composite.
 */
export function brightPass(value: number, threshold: number, knee = 0.5): number {
  if (knee < 0) throw new RangeError(`bloom knee must be >= 0, got ${knee}`);
  if (knee === 0) return value >= threshold ? value : 0;
  const lo = threshold - knee;
  const hi = threshold + knee;
  if (value <= lo) return 0;
  if (value >= hi) return value;
  const t = (value - lo) / (hi - lo); // 0..1 across the knee band
  const s = t * t * (3 - 2 * t); // smoothstep
  return value * s;
}

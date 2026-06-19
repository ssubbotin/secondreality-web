import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';
import { RenderTarget } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BloomComposite, BloomPass } from './bloom.js';

/**
 * GPU rendering (`render`) needs a live backend and is human-verified in the lab; here we exercise the
 * CPU-side lifecycle — allocation/resize/dispose and the setters — which must not throw and must keep
 * scratch-target bookkeeping consistent across mode swaps.
 */
function makeSourceTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array(4 * 4 * 4), 4, 4, RGBAFormat, UnsignedByteType);
  tex.needsUpdate = true;
  return tex;
}

describe('BloomPass lifecycle', () => {
  it('constructs, sizes scratch targets, and disposes without throwing', () => {
    const bloom = new BloomPass();
    bloom.setSource(makeSourceTexture());
    expect(() => bloom.resize(640, 400)).not.toThrow();
    expect(() => bloom.dispose()).not.toThrow();
  });

  it('is idempotent on a repeated dispose', () => {
    const bloom = new BloomPass();
    bloom.resize(320, 200);
    bloom.dispose();
    expect(() => bloom.dispose()).not.toThrow();
  });

  it('accepts setSource before and after resize (mode-swap order independence)', () => {
    const bloom = new BloomPass();
    expect(() => {
      bloom.setSource(makeSourceTexture());
      bloom.resize(256, 256);
      bloom.setSource(makeSourceTexture());
    }).not.toThrow();
    bloom.dispose();
  });

  it('tolerates resize before any source is set', () => {
    const bloom = new BloomPass();
    expect(() => bloom.resize(128, 64)).not.toThrow();
    bloom.dispose();
  });

  it('handles tiny sizes by clamping the half-res scratch targets to >= 1px', () => {
    const bloom = new BloomPass();
    expect(() => bloom.resize(1, 1)).not.toThrow();
    bloom.dispose();
  });

  it('reallocates on a size change but not on a same-size resize', () => {
    const bloom = new BloomPass() as unknown as { brightRT: { width: number } | null };
    const pass = bloom as unknown as BloomPass;
    pass.resize(640, 400);
    const first = bloom.brightRT;
    pass.resize(640, 400); // same size → keep the existing target
    expect(bloom.brightRT).toBe(first);
    pass.resize(800, 600); // new size → reallocate
    expect(bloom.brightRT).not.toBe(first);
    pass.dispose();
  });

  it('stores strength and threshold setters without throwing', () => {
    const bloom = new BloomPass();
    expect(() => {
      bloom.setStrength(1.4);
      bloom.setThreshold(0.55, 0.2);
    }).not.toThrow();
    bloom.dispose();
  });
});

describe('BloomComposite lifecycle', () => {
  it('allocates a scratch target sized to the output and disposes cleanly', () => {
    const c = new BloomComposite() as unknown as { scratch: { width: number } | null };
    const composite = c as unknown as BloomComposite;
    composite.resize(640, 400);
    expect(c.scratch?.width).toBe(640);
    composite.dispose();
    expect(c.scratch).toBeNull();
  });

  it('keeps the scratch target across a same-size resize and reallocates on change', () => {
    const c = new BloomComposite() as unknown as { scratch: RenderTarget | null };
    const composite = c as unknown as BloomComposite;
    composite.resize(800, 600);
    const first = c.scratch;
    composite.resize(800, 600);
    expect(c.scratch).toBe(first);
    composite.resize(1024, 768);
    expect(c.scratch).not.toBe(first);
    composite.dispose();
  });

  it('lazily allocates to the output size when render is called without a prior resize', () => {
    const c = new BloomComposite() as unknown as {
      scratch: { width: number; height: number } | null;
    };
    const composite = c as unknown as BloomComposite;
    const output = new RenderTarget(512, 256);
    let drawn: RenderTarget | null = null;
    // The fake renderer is never used: render bails after `draw` if no GPU backend resolves the quad,
    // but allocation + the draw callback run first, which is what we assert. Guard against the GPU call
    // throwing by catching — allocation has already happened by then.
    try {
      composite.render({} as never, output, (_r, rt) => {
        drawn = rt;
      });
    } catch {
      // QuadMesh.render needs a live backend; ignore — allocation + draw ran before it.
    }
    expect(c.scratch?.width).toBe(512);
    expect(c.scratch?.height).toBe(256);
    expect(drawn).toBe(c.scratch);
    composite.dispose();
    output.dispose();
  });

  it('passes strength/threshold through without throwing', () => {
    const composite = new BloomComposite();
    expect(() => {
      composite.setStrength(1.2);
      composite.setThreshold(0.5);
      composite.setThreshold(0.5, 0.3);
    }).not.toThrow();
    composite.dispose();
  });
});

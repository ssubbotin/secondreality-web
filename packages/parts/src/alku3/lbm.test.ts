import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeLbm, type RevealPictureName } from './lbm.js';

// Tests run in vitest's node environment and are excluded from tsc (parts tsconfig excludes *.test.ts),
// so node:fs/node:url/node:crypto are fine here without @types/node.
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}.LBM`, import.meta.url)));

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/**
 * Independent oracle, computed once with a standalone Python decoder over the vendored fixtures (PBM +
 * ByteRun1). The decode is byte-exact iff the engine `decodeLbm` reproduces these. `idxSha` is the SHA-256
 * of the `width*height` index buffer; `palSha` is the SHA-256 of the 256-colour 8-bit CMAP (768 bytes).
 */
interface Oracle {
  width: number;
  height: number;
  idxSha: string;
  palSha: string;
  first8: number[];
  mid8: number[];
  last8: number[];
}

const ORACLE: Record<RevealPictureName, Oracle> = {
  PIC001: {
    width: 320,
    height: 200,
    idxSha: '154677f7ffad85f3c2f71e4bed7db3c3035244a50bd83ec67db6c4377c6926fd',
    palSha: '8883cd5fe1095228010e797c88b9ac635340fcfcfd64460a291364d6e69e7fa0',
    first8: [0, 0, 0, 0, 0, 0, 0, 0],
    mid8: [47, 47, 47, 47, 47, 47, 47, 47],
    last8: [0, 0, 0, 0, 0, 0, 0, 0],
  },
  HOIKKA: {
    width: 640,
    height: 200,
    idxSha: '4f34c28b6498f559e5f6dc92ce32f3f7df74775a5fa67d29cc630fda5605ea47',
    palSha: 'a313b2875cb12eda61b5319b0e99604bda16cf5903ab8d8460a0b45adcca104e',
    first8: [62, 62, 62, 62, 62, 62, 62, 62],
    mid8: [19, 19, 18, 18, 18, 18, 18, 18],
    last8: [0, 0, 0, 0, 0, 0, 0, 0],
  },
  RYPPIS: {
    width: 640,
    height: 200,
    idxSha: '262d85ab551403a7579a4b82a0cefbebf9dabfe1e53443f3367601835dde4d70',
    palSha: '8883cd5fe1095228010e797c88b9ac635340fcfcfd64460a291364d6e69e7fa0',
    first8: [47, 47, 47, 47, 47, 47, 47, 47],
    mid8: [19, 19, 18, 18, 18, 18, 18, 18],
    last8: [0, 0, 0, 0, 0, 0, 0, 0],
  },
  'U2-MOVIE': {
    width: 320,
    height: 400,
    idxSha: 'fec7a1a7410ca996bfa0d44b770781dccb1f07ded777cdcc926937cb6e5390b2',
    palSha: 'eb91ebd7216551bfbc579b38280f1c5cb5ca12389950e2683b1f23e87cb3968c',
    first8: [0, 0, 0, 0, 0, 0, 0, 0],
    mid8: [0, 0, 0, 0, 0, 0, 0, 0],
    last8: [0, 0, 0, 0, 0, 0, 0, 0],
  },
};

describe('alku3 reveal-picture LBM decode (engine decodeLbm, byte-exact vs oracle)', () => {
  for (const name of Object.keys(ORACLE) as RevealPictureName[]) {
    const o = ORACLE[name];
    describe(name, () => {
      const pic = decodeLbm(fixture(name));

      it('decodes the BMHD dimensions', () => {
        expect([pic.width, pic.height]).toEqual([o.width, o.height]);
        expect(pic.indices).toHaveLength(o.width * o.height);
      });

      it('reproduces the index buffer byte-for-byte (SHA-256)', () => {
        expect(sha(pic.indices)).toBe(o.idxSha);
      });

      it('reproduces the 8-bit CMAP byte-for-byte (SHA-256)', () => {
        // decodeLbm pads/truncates the CMAP to 256 RGB triples (768 bytes).
        expect(pic.palette).toHaveLength(768);
        expect(sha(pic.palette)).toBe(o.palSha);
      });

      it('matches spot pixels on the first / middle / last rows', () => {
        const w = o.width;
        const mid = Math.floor(o.height / 2) * w;
        const end = w * o.height;
        expect(Array.from(pic.indices.subarray(0, 8))).toEqual(o.first8);
        expect(Array.from(pic.indices.subarray(mid, mid + 8))).toEqual(o.mid8);
        expect(Array.from(pic.indices.subarray(end - 8, end))).toEqual(o.last8);
      });

      it('exposes palette6 = palette >> 2', () => {
        for (let i = 0; i < 768; i++) {
          expect(pic.palette6[i]).toBe((pic.palette[i] ?? 0) >> 2);
        }
      });
    });
  }
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPicture } from './loader.js';
import { decodePicture } from './picture.js';

const srtitleBytes = (): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL('./__fixtures__/SRTITLE.U', import.meta.url))));

describe('loadPicture', () => {
  it('fetches the URL and decodes it identically to decodePicture', async () => {
    const bytes = srtitleBytes();
    let requested = '';
    const fakeFetch = (async (url: string | URL) => {
      requested = String(url);
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf,
      } as Response;
    }) as unknown as typeof fetch;

    const pic = await loadPicture('/pics/SRTITLE.U', fakeFetch);
    const direct = decodePicture(bytes);
    expect(requested).toBe('/pics/SRTITLE.U');
    expect(pic.width).toBe(direct.width);
    expect(pic.height).toBe(direct.height);
    expect(pic.magic).toBe(direct.magic);
    expect(pic.indices).toEqual(direct.indices);
    expect(pic.palette6).toEqual(direct.palette6);
  });

  it('throws on a non-ok response', async () => {
    const fakeFetch = (async () =>
      ({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as Response) as unknown as typeof fetch;
    await expect(loadPicture('/pics/missing.U', fakeFetch)).rejects.toThrow(/404/);
  });
});

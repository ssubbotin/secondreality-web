import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';

/**
 * Build a 256×1 RGBA `DataTexture` palette LUT from an 8-bit (0..255) VGA RGB palette, tagged
 * `SRGBColorSpace` so the DAC bytes land verbatim on the canvas (the dot-tunnel / plasma / techno
 * pattern). `NearestFilter` keeps index lookups exact. Caller owns disposal.
 */
export function buildPaletteLut(palette: Uint8Array): DataTexture {
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    data[i * 4] = palette[i * 3] ?? 0;
    data[i * 4 + 1] = palette[i * 3 + 1] ?? 0;
    data[i * 4 + 2] = palette[i * 3 + 2] ?? 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, 256, 1, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

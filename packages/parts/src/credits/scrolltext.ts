/**
 * The ENDSCRL scroll content, parsed from `ENDSCROL.TXT`.
 *
 * The original `init()` (`MAIN.C:101`) does `read(a,text,60000)` to slurp the file into a flat buffer, and
 * `do_scroll` then walks a cursor that splits **on `\n` only** (`for(...; *tptr!='\n'; ...)`). The shipped
 * `ENDSCROL.TXT` uses CRLF line endings; the `\r` preceding each `\n` is kept in the line, but `\r` (and the
 * tabs in the separator line) have no glyph entry, so they render as zero-width — exactly the original's
 * behaviour. We therefore split on `\n` and preserve the rest of each segment verbatim; the renderer skips
 * unmapped characters via the font glyph table.
 */
export interface ScrollText {
  /** The newline-split lines, in order, with `\r`/`\t` preserved (rendered as zero-width by the font). */
  readonly lines: readonly string[];
}

/**
 * Parse the scroll content from a raw `ENDSCROL.TXT` buffer. Bytes are decoded as Latin-1 (the DOS CP437
 * text is ASCII-only here) and split on `\n`, matching the original cursor walk. A trailing empty segment
 * (from a final `\n`) is preserved so the scroll's blank tail matches the file.
 */
export function parseScrollText(buf: ArrayBuffer | Uint8Array | string): ScrollText {
  const text = typeof buf === 'string' ? buf : decodeLatin1(buf);
  return { lines: text.split('\n') };
}

function decodeLatin1(buf: ArrayBuffer | Uint8Array): string {
  const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i] ?? 0);
  return s;
}

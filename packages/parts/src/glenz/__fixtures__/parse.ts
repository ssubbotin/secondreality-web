import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Read a vendored MASM `.INC` fixture as text. */
export function readFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
}

/** Parse every `dw a,b,c,...` word (signed 16-bit decimal) out of a vendored MASM include. */
export function parseDw(name: string): number[] {
  const out: number[] = [];
  for (const raw of readFixture(name).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = line.match(/^\s*dw\s+(.+)$/i);
    if (!m) continue;
    for (const tok of (m[1] ?? '').split(',')) {
      const t = tok.trim();
      if (t.length === 0) continue;
      out.push(Number.parseInt(t, 10));
    }
  }
  return out;
}

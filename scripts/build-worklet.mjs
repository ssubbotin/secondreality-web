import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const gluePath = 'packages/engine/src/audio/libopenmpt.glue.js';
const procPath = 'packages/engine/src/audio/player-worklet.js';
const outPath = 'apps/lab/public/worklets/player-worklet.js';

let glue = readFileSync(gluePath, 'utf8');

// The glue is an ES module whose ONLY export is `export default libopenmpt;` (NOT line-anchored).
// Remove that statement; `function libopenmpt(...)` remains a global in the concatenated classic script.
glue = glue.replace(/export\s+default\s+libopenmpt\s*;?/, '');
// Defensive: strip any other ESM export forms if present.
glue = glue.replace(/export\s*\{[^}]*\}\s*;?/g, '');
// `import.meta.url` is invalid in a classic worklet; the wasm comes via wasmBinary anyway.
glue = glue.replaceAll('import.meta.url', "''");
glue = glue.replaceAll('import.meta', '({})');

const processor = readFileSync(procPath, 'utf8');

mkdirSync('apps/lab/public/worklets', { recursive: true });
writeFileSync(outPath, `${glue}\n;\n${processor}\n`);
console.log(`built ${outPath} (${glue.length + processor.length} bytes)`);

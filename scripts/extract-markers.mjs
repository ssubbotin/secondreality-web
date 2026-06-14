// Build-time STMIK Zxx sync-marker extractor.
//
// Future Crew's music drives the demo's effect timing via the ScreamTracker-3 "Zxx"
// command (STMIK's sync marker). A hand-rolled S3M pattern parser CANNOT read these
// modules' pattern data reliably (verified: MUSIC0.S3M's patterns don't decode under the
// public S3M spec, yet libopenmpt plays it perfectly). So we extract markers through the
// vendored libopenmpt build — the parser that demonstrably reads these exact files —
// reading the effect column of every cell in play order.
//
// Output: a marker table JSON consumed at runtime by the sync reconstruction (Plan 03).
//   { module, channels, totalRows, orderStartRow[], markers:[{absRow,order,row,ch,code}] }
//
// Run with:  pnpm extract:markers   (regenerate only when a module file changes)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// libopenmpt command-column indices (from libopenmpt.h).
const CMD_EFFECT = 3;
const CMD_PARAMETER = 5;

const gluePath = fileURLToPath(
  new URL('../packages/engine/src/audio/libopenmpt.glue.js', import.meta.url),
);
const { default: libopenmpt } = await import(gluePath);
const M = await libopenmpt({});

/** Read a NUL-terminated C string out of the wasm heap. */
function cstr(ptr) {
  if (!ptr) return '';
  let end = ptr;
  while (M.HEAPU8[end] !== 0) end++;
  return Buffer.from(M.HEAPU8.subarray(ptr, end)).toString('latin1');
}

function extract(srcPath, moduleName) {
  const data = readFileSync(srcPath);
  const ptr = M._malloc(data.length);
  M.HEAPU8.set(data, ptr);
  const mod = M._openmpt_module_create_from_memory(ptr, data.length, 0, 0, 0);
  M._free(ptr);
  if (!mod) throw new Error(`libopenmpt failed to load ${srcPath}`);

  const numOrders = M._openmpt_module_get_num_orders(mod);
  const channels = M._openmpt_module_get_num_channels(mod);

  // absRow space: orderStartRow[order] is the cumulative play-row count before that order,
  // so absRow = orderStartRow[order] + row. The runtime reconstructs the SAME absRow from
  // libopenmpt's live (order,row) — keeping markers and the play head in one coordinate space.
  const orderStartRow = [];
  const markers = [];
  let absRow = 0;
  for (let order = 0; order < numOrders; order++) {
    orderStartRow.push(absRow);
    const pat = M._openmpt_module_get_order_pattern(mod, order);
    const rows = pat >= 0 ? M._openmpt_module_get_pattern_num_rows(mod, pat) : 0;
    for (let row = 0; row < rows; row++) {
      for (let ch = 0; ch < channels; ch++) {
        const sp = M._openmpt_module_format_pattern_row_channel_command(
          mod,
          pat,
          row,
          ch,
          CMD_EFFECT,
        );
        const effect = cstr(sp);
        M._openmpt_free_string(sp);
        if (effect[0] === 'Z') {
          // The Zxx parameter byte is np_zinfo (the sync code parts compare against).
          const code = M._openmpt_module_get_pattern_row_channel_command(
            mod,
            pat,
            row,
            ch,
            CMD_PARAMETER,
          );
          markers.push({ absRow: absRow + row, order, row, ch, code });
        }
      }
    }
    absRow += rows;
  }
  M._openmpt_module_destroy(mod);
  markers.sort((a, b) => a.absRow - b.absRow || a.ch - b.ch);
  return { module: moduleName, channels, totalRows: absRow, orderStartRow, markers };
}

const jobs = [
  {
    src: 'apps/lab/public/music/MUSIC0.S3M',
    out: 'apps/lab/public/music/markers-music0.json',
    name: 'MUSIC0.S3M',
  },
];

for (const job of jobs) {
  const table = extract(job.src, job.name);
  // Pretty-print (2-space) so the generated, committed JSON matches Biome's formatter.
  writeFileSync(job.out, `${JSON.stringify(table, null, 2)}\n`);
  const codes = [...new Set(table.markers.map((m) => m.code))].sort((a, b) => a - b);
  console.log(
    `${job.out}: ${table.markers.length} markers over ${table.totalRows} rows (${table.channels} ch); ` +
      `codes ${codes.map((c) => `0x${c.toString(16)}`).join(' ')}`,
  );
}

// Median, min and max clone time per method and wait, for each results-*.ndjson file.
import Fs from "node:fs";
const D = Fs.realpathSync(new URL(".", import.meta.url).pathname);
for (const f of Fs.readdirSync(D).filter(f => /^results-\d+\.ndjson$/.test(f))) {
  const rows = Fs.readFileSync(`${D}/${f}`, "utf8").trim().split("\n").map(l => JSON.parse(l));
  const groups = {};
  for (const r of rows) (groups[`${r.method} | ${r.wait}`] ??= []).push(r.ms);
  console.log(`\n${f} (${rows.length} trials)`);
  for (const [k, v] of Object.entries(groups).sort()) {
    v.sort((a, b) => a - b);
    console.log(`${k.padEnd(28)} median ${String(v[v.length >> 1]).padStart(5)} ms  range ${v[0]}-${v[v.length - 1]}  n=${v.length}`);
  }
}

// Does APFS clone slower when the source files were just written?
// Writes ~10k real package files fresh, then places them by per-file clone, dir clone or copy:
// right away, after `sync`, or after a wait. 15 packages in flight, like fyn.
import Fs from "node:fs";
import Path from "node:path";
import { spawnSync } from "node:child_process";
import { cloneDir, cloneFiles } from "/Users/joel.chen/dev/fynjs/packages/reflink/index.js";

const D = Path.dirname(new URL(import.meta.url).pathname);
// SRC is any installed node_modules, e.g. the fyn tree the memory probe leaves in run/fyn
const SRC = process.env.SRC || `${D}/../mem-probe/run/fyn/node_modules`;
const WORK = `${D}/work`;
const ROUNDS = Number(process.env.ROUNDS || 3);
const WAIT = Number(process.env.WAIT || 35);
const MAX_FILES = Number(process.env.MAX_FILES || 10000);

// load packages (dirs holding a package.json) into memory until MAX_FILES
function walk(dir, rel = "", out = []) {
  for (const e of Fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(`${dir}/${e.name}`, r, out);
    else if (e.isFile()) out.push(r);
  }
  return out;
}
const pkgs = [];
let total = 0;
for (const top of Fs.readdirSync(SRC).sort()) {
  const tops = top.startsWith("@") ? Fs.readdirSync(`${SRC}/${top}`).map(n => `${top}/${n}`) : [top];
  for (const name of tops) {
    if (!Fs.existsSync(`${SRC}/${name}/package.json`)) continue;
    const files = walk(`${SRC}/${name}`).map(f => ({ f, b: Fs.readFileSync(`${SRC}/${name}/${f}`) }));
    pkgs.push({ name, files });
    total += files.length;
    if (total >= MAX_FILES) break;
  }
  if (total >= MAX_FILES) break;
}
const bytes = pkgs.reduce((n, p) => n + p.files.reduce((m, x) => m + x.b.length, 0), 0);
console.log(`${pkgs.length} packages, ${total} files, ${(bytes / 2 ** 20).toFixed(1)} MB`);

function writeTree(root) {
  for (const p of pkgs) {
    for (const { f, b } of p.files) {
      const file = `${root}/${p.name}/${f}`;
      Fs.mkdirSync(Path.dirname(file), { recursive: true });
      Fs.writeFileSync(file, b);
    }
  }
}

async function pool(jobs, n = 15) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) await jobs[i++](); }));
}

const methods = {
  "clone files": (src, dst) => pool(pkgs.map(p => () => cloneFiles(`${src}/${p.name}`, `${dst}/${p.name}`, p.files.map(x => x.f), false, false))),
  "clone dir": async (src, dst) => {
    for (const p of pkgs) Fs.mkdirSync(Path.dirname(`${dst}/${p.name}`), { recursive: true });
    await pool(pkgs.map(p => async () => { if (!(await cloneDir(`${src}/${p.name}`, `${dst}/${p.name}`))) throw new Error("cloneDir false"); }));
  },
  copy: (src, dst) => pool(pkgs.map(p => async () => {
    for (const { f } of p.files) {
      await Fs.promises.mkdir(Path.dirname(`${dst}/${p.name}/${f}`), { recursive: true });
      await Fs.promises.copyFile(`${src}/${p.name}/${f}`, `${dst}/${p.name}/${f}`);
    }
  }))
};
const waits = {
  "right away": () => {},
  "after sync": () => spawnSync("/bin/sync"),
  [`after ${WAIT}s`]: () => new Promise(r => setTimeout(r, WAIT * 1000))
};

const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
Fs.rmSync(WORK, { recursive: true, force: true });
let n = 0;
for (let round = 1; round <= ROUNDS; round++) {
  const trials = shuffle(Object.keys(methods).flatMap(m => Object.keys(waits).map(w => [m, w])));
  for (const [m, w] of trials) {
    const src = `${WORK}/${++n}-src`, dst = `${WORK}/${n}-dst`;
    const tw = performance.now();
    writeTree(src);
    const writeMs = performance.now() - tw;
    await waits[w]();
    const t = performance.now();
    await methods[m](src, dst);
    const ms = performance.now() - t;
    const row = { round, method: m, wait: w, ms: Math.round(ms), writeMs: Math.round(writeMs) };
    console.log(JSON.stringify(row));
    Fs.appendFileSync(`${D}/results-${MAX_FILES}.ndjson`, JSON.stringify(row) + "\n");
    Fs.rmSync(src, { recursive: true, force: true });
    Fs.rmSync(dst, { recursive: true, force: true });
    spawnSync("/bin/sync"); // settle the deletes before the next trial
  }
}
console.log("# ALL DONE");

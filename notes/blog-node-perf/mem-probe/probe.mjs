// Peak memory of npm, pnpm 11, pnpm 12 and fyn installing alotta-files from registry.npmjs.org.
// Each install runs under `/usr/bin/time` (-l on macOS, -v on Linux), which reports the process's
// max RSS. macOS also reports peak memory footprint. Threads live in the same process, so both
// numbers include them. FIX and FYN override the fixture and fyn paths.
import Fs from "node:fs";
import Path from "node:path";
import { spawnSync } from "node:child_process";

const D = Path.dirname(new URL(import.meta.url).pathname);
const M = `${D}/managers`;
const FIX = process.env.FIX || "/Users/joel.chen/dev/fynjs/.temp/pnpm-bench/fixtures/alotta-files/package.json";
const FYN = process.env.FYN || "/Users/joel.chen/dev/fynjs/packages/fyn/bin/fyn.mjs";
const REG = "https://registry.npmjs.org/";
const NODE = process.execPath;
const rounds = Number(process.env.ROUNDS || 2);
const only = process.env.ONLY?.split(",");
const linux = process.platform === "linux";

const mgrs = {
  npm: cwd => ({
    bin: NODE,
    args: [`${M}/npm/bin/npm-cli.js`, "install", "--no-audit", "--no-fund", "--ignore-scripts", "--legacy-peer-deps", `--cache=${cwd}/cache/npm`, `--registry=${REG}`]
  }),
  pnpm11: cwd => {
    Fs.writeFileSync(`${cwd}/pnpm-workspace.yaml`, `packages:\n  - '.'\nstoreDir: ${cwd}/cache/store\ncacheDir: ${cwd}/cache/cache\n`);
    return { bin: NODE, args: [`${M}/pnpm11/bin/pnpm.cjs`, "install", "--ignore-scripts", `--registry=${REG}`], env: { PNPM_HOME: `${cwd}/cache` } };
  },
  pnpm12: cwd => {
    Fs.writeFileSync(`${cwd}/pnpm-workspace.yaml`, `packages:\n  - '.'\ntrustLockfile: true\n`);
    return { bin: `${M}/pnpm12/pnpm`, args: ["install", "--ignore-scripts", `--registry=${REG}`], env: { PNPM_HOME: `${cwd}/cache`, PNPM_CONFIG_CACHE_DIR: `${cwd}/cache/cache` } };
  },
  fyn: cwd => ({
    bin: NODE,
    args: [FYN, "install", "--script-policy=off", "--progress=none", "--no-audit", `--registry=${REG}`],
    env: { FYN_DIR: `${cwd}/cache/fyn` }
  })
};

function setup(name) {
  const cwd = `${D}/run/${name}`;
  Fs.rmSync(cwd, { recursive: true, force: true });
  Fs.mkdirSync(cwd, { recursive: true });
  Fs.copyFileSync(FIX, `${cwd}/package.json`);
  Fs.writeFileSync(`${cwd}/.npmrc`, `registry=${REG}\n`);
  return cwd;
}

function measure(name, cwd, label) {
  const { bin, args, env = {} } = mgrs[name](cwd);
  const t = process.hrtime.bigint();
  const r = spawnSync("/usr/bin/time", [linux ? "-v" : "-l", bin, ...args], { cwd, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 << 20 });
  const s = Number(process.hrtime.bigint() - t) / 1e9;
  const num = re => Number(r.stderr.match(re)?.[1] ?? NaN);
  const rss = linux ? num(/Maximum resident set size \(kbytes\): (\d+)/) / 1024 : num(/(\d+)\s+maximum resident set size/) / 2 ** 20;
  const foot = num(/(\d+)\s+peak memory footprint/) / 2 ** 20;
  const ok = r.status === 0;
  if (!ok) console.log(`  ${name} ${label} FAILED\n${(r.stdout + r.stderr).slice(-1500)}`);
  const row = { name, label, ok, seconds: +s.toFixed(2), maxRssMB: Math.round(rss), peakFootprintMB: Math.round(foot) };
  console.log(`${name.padEnd(8)} ${label.padEnd(6)} ${s.toFixed(2).padStart(6)}s  rss ${String(row.maxRssMB).padStart(5)} MB  footprint ${String(row.peakFootprintMB).padStart(5)} MB${ok ? "" : "  FAILED"}`);
  Fs.appendFileSync(`${D}/results.ndjson`, JSON.stringify(row) + "\n");
}

console.log(`node ${process.version}`);
for (let i = 1; i <= rounds; i++) {
  console.log(`# round ${i}`);
  for (const name of Object.keys(mgrs).filter(n => !only || only.includes(n))) {
    const cwd = setup(name);
    measure(name, cwd, "clean");
    // warm cache: drop node_modules and lockfiles, keep the cache
    for (const f of ["node_modules", "package-lock.json", "pnpm-lock.yaml", "fyn-lock.yaml"]) {
      Fs.rmSync(`${cwd}/${f}`, { recursive: true, force: true });
    }
    measure(name, cwd, "cache");
  }
}

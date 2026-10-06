// Draws the blog figures as standalone SVGs from the numbers in notes/fyn-install-perf.md.
// Figures use a fixed light look so they read the same on any blog theme.
// Run: node notes/blog-node-perf/build-figures.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("figures/", import.meta.url);
mkdirSync(out, { recursive: true });

const C = {
  bg: "#f6f7f9",
  ink: "#1c2330",
  muted: "#5a6474",
  faint: "#8a93a2",
  grid: "#dfe3ea",
  fyn: "#2a78d6",
  pnpm12: "#eb6834",
  other: "#9aa1ab",
  miss: "#6f7887"
};
const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(x, y, s, { size = 24, fill = C.ink, weight = 400, anchor = "start", mono = false } = {}) {
  return `<text x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}

// horizontal bar with a rounded data end, square at the baseline
function hbar(x, y, w, h, fill) {
  if (w <= 0) return "";
  const r = Math.min(4, w);
  return `<path d="M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z" fill="${fill}"/>`;
}

function svg(name, w, h, label, body) {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
<rect width="${w}" height="${h}" rx="16" fill="${C.bg}"/>
${body}
</svg>
`;
  writeFileSync(new URL(name, out), doc);
}

const fmt = (v, d = 2) => v.toFixed(d);

// ---- 1. timeline ---------------------------------------------------------------------------

{
  const W = 1200, H = 500, x0 = 110, x1 = 1040, axisY = 300;
  const cols = ["2010", "2011", "2013-14", "2015", "2016", "2017", "2026"];
  const step = (x1 - x0) / (cols.length - 1);
  const cx = i => x0 + i * step;
  const above = [
    [0, ["npm", "first release"]],
    [1, ["npm 1.0"]],
    [2, ["npm installs", "tens of minutes"]],
    [3, ["Lerna"]],
    [4, ["pnpm", "Yarn"]],
    [5, ["pnpm 1.0", "Yarn 1.0"]],
    [6, ["pnpm 12", "rewritten in Rust"], C.pnpm12]
  ];
  const below = [
    [2, ["my scripts for", "30+ package repos"]],
    [3, ["fyn", "internal use"]],
    [5, ["fyn", "on npm"]],
    [6, ["fyn perf", "journey with AI"]]
  ];
  let b = text(60, 64, "npm, pnpm, Yarn, Lerna, and fyn", { size: 34, weight: 700 });
  b += text(60, 104, "Ecosystem above the line, my projects below", { size: 24, fill: C.muted });
  // axis, with a break between 2017 and 2026
  const brk = (cx(5) + cx(6)) / 2;
  b += `<line x1="${x0 - 30}" y1="${axisY}" x2="${brk - 14}" y2="${axisY}" stroke="${C.faint}" stroke-width="2"/>`;
  b += `<line x1="${brk + 14}" y1="${axisY}" x2="${x1 + 30}" y2="${axisY}" stroke="${C.faint}" stroke-width="2"/>`;
  b += text(brk, axisY + 8, "…", { size: 28, fill: C.faint, anchor: "middle" });
  cols.forEach((c, i) => {
    b += `<circle cx="${cx(i)}" cy="${axisY}" r="7" fill="${C.bg}" stroke="${C.faint}" stroke-width="2"/>`;
    b += text(cx(i), axisY + 44, c, { size: 22, fill: C.muted, anchor: "middle", mono: true });
  });
  for (const [i, lines, color = C.ink] of above) {
    b += `<line x1="${cx(i)}" y1="${axisY - 12}" x2="${cx(i)}" y2="${axisY - 46}" stroke="${C.grid}" stroke-width="2"/>`;
    lines.forEach((l, k) => {
      b += text(cx(i), axisY - 60 - (lines.length - 1 - k) * 28, l, { size: k === 0 ? 24 : 20, weight: k === 0 ? 700 : 400, fill: k === 0 ? color : C.muted, anchor: "middle" });
    });
  }
  for (const [i, lines] of below) {
    b += `<line x1="${cx(i)}" y1="${axisY + 58}" x2="${cx(i)}" y2="${axisY + 86}" stroke="${C.fyn}" stroke-width="2"/>`;
    lines.forEach((l, k) => {
      b += text(cx(i), axisY + 116 + k * 28, l, { size: k === 0 ? 24 : 20, weight: k === 0 ? 700 : 400, fill: k === 0 ? C.fyn : C.muted, anchor: "middle" });
    });
  }
  svg("timeline.svg", W, H, "Timeline: npm 2010, npm 1.0 2011, Lerna and fyn in internal use 2015, pnpm and Yarn 2016, fyn on npm 2017, pnpm 12 in Rust 2026", b);
}

// ---- 2. how an install runs ----------------------------------------------------------------

{
  const W = 1200, H = 520, x0 = 230, x1 = 1140, gap = 12;
  const phases = [
    ["resolve", "packument HTTP", ["unzip, parse,", "trim packuments"], 0.40],
    ["fetch", "tarball HTTP", ["verify, untar,", "write store entry"], 0.36],
    ["place", "dispatch jobs", ["clone, link or", "copy files"], 0.24]
  ];
  let b = text(60, 64, "How a fyn install runs", { size: 34, weight: 700 });
  b += text(60, 104, "Every win moved work off the main thread, or cut it", { size: 24, fill: C.muted });
  const mainY = 170, wkY = 340, laneH = 96;
  b += text(60, mainY + 44, "main thread", { size: 24, weight: 700 });
  b += text(60, mainY + 74, "the limit", { size: 20, fill: C.pnpm12, weight: 700 });
  b += text(60, wkY + 44, "fs workers", { size: 24, weight: 700 });
  b += text(60, wkY + 74, "cores − 1, max 8", { size: 20, fill: C.muted });
  let x = x0;
  const span = x1 - x0 - gap * (phases.length - 1);
  b += `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C.faint}"/></marker></defs>`;
  for (const [name, mainJob, wk, frac] of phases) {
    const w = span * frac, mid = x + w / 2;
    b += `<rect x="${x}" y="${mainY}" width="${w}" height="${laneH}" rx="8" fill="${C.ink}"/>`;
    b += text(mid, mainY + 42, name, { size: 26, weight: 700, fill: "#ffffff", anchor: "middle" });
    b += text(mid, mainY + 74, mainJob, { size: 20, fill: "#c9d0db", anchor: "middle" });
    b += `<rect x="${x}" y="${wkY}" width="${w}" height="${laneH}" rx="8" fill="#ffffff" stroke="${C.fyn}" stroke-width="2"/>`;
    b += text(mid, wkY + 42, wk[0], { size: 21, fill: C.ink, anchor: "middle" });
    b += text(mid, wkY + 70, wk[1], { size: 21, fill: C.ink, anchor: "middle" });
    b += `<line x1="${mid - 16}" y1="${mainY + laneH + 8}" x2="${mid - 16}" y2="${wkY - 8}" stroke="${C.faint}" stroke-width="2" marker-end="url(#ar)"/>`;
    b += `<line x1="${mid + 16}" y1="${wkY - 8}" x2="${mid + 16}" y2="${mainY + laneH + 8}" stroke="${C.faint}" stroke-width="2" marker-end="url(#ar)"/>`;
    x += w + gap;
  }
  b += text(x0, H - 40, "jobs go down, results come back up as one message each", { size: 20, fill: C.muted });
  svg("install-pipeline.svg", W, H, "fyn install: the main thread runs HTTP and dispatch for resolve, fetch and place; fs workers parse, untar and place files", b);
}

// ---- 3. what each change saved -------------------------------------------------------------

{
  const rows = [
    ["Keep trimmed packuments", "warm-install cache size", 179, 27, "MB"],
    ["Parse each version once", "resolving the ranges", 44, 19, "ms"],
    ["Untar in workers", "Linux lockfile install", 13.9, 7.3, "s"],
    ["Parse packuments in workers", "Linux resolve", 7.4, 4.3, "s"],
    ["32 sockets, not 15", "Mac clean install, 50 ms simulated latency", 13.0, 8.46, "s"],
    ["Untar in workers", "Linux clean install", 21.4, 14.3, "s"],
    ["One clone per package dir", "Mac clone clean install", 14.7, 10.0, "s"],
    ["Compile cache, lazy loads", "startup", 131, 95, "ms"],
    ["Abbreviated packuments", "Linux resolve", 4.1, 3.1, "s"],
    ["One sync scan in a worker", "Linux warm-cache install", 3.1, 2.47, "s"],
    ["Skip a stack trace per request", "Linux clean install", 7.9, 7.6, "s"]
  ];
  const W = 1200, rowH = 64, top = 150, H = top + rows.length * rowH + 50;
  const lx = 60, bx = 520, bw = 360, vx = 1140;
  let b = text(60, 64, "What each change saved", { size: 34, weight: 700 });
  b += text(60, 104, "Share of the measured value removed, before → after", { size: 24, fill: C.muted });
  for (const t of [0, 0.5, 1]) {
    const gx = bx + t * bw;
    b += `<line x1="${gx}" y1="${top - 14}" x2="${gx}" y2="${top + rows.length * rowH - 10}" stroke="${C.grid}" stroke-width="1.5"/>`;
    b += text(gx, top + rows.length * rowH + 22, `${t * 100}%`, { size: 18, fill: C.faint, anchor: "middle", mono: true });
  }
  rows.forEach(([name, what, a, z, unit], i) => {
    const y = top + i * rowH, saved = (a - z) / a;
    b += text(lx, y + 22, name, { size: 22, weight: 700 });
    b += text(lx, y + 46, what, { size: 18, fill: C.muted });
    b += hbar(bx, y + 8, Math.max(2, saved * bw), 32, C.fyn);
    b += text(bx + saved * bw + 10, y + 32, `${Math.round(saved * 100)}%`, { size: 20, weight: 700, fill: C.ink });
    const d = unit === "s" ? (a < 10 ? 2 : 1) : 0;
    b += text(vx, y + 32, `${a.toFixed(d)} → ${z.toFixed(d)} ${unit}`, { size: 20, fill: C.muted, anchor: "end", mono: true });
  });
  svg("wins.svg", W, H, "What each change saved: from 85% smaller trimmed packuments down to 4% from skipping a stack trace per request", b);
}

// ---- 4. what didn't help -------------------------------------------------------------------

{
  const rows = [
    ["Download tarballs during resolve", "Mac clean install", 7.74, 9.59],
    ["Fetch tarballs in workers", "Linux clean install", 0, 0.7],
    ["Fetch packuments in workers", "Linux clean install", 0, 0.3],
    ["UV_THREADPOOL_SIZE=16", "Mac install", 0, 0.2],
    ["Native Rust untar, 4 threads", "untar the fixture", 3.32, 3.35],
    ["--max-semi-space-size=64", "install", 0.08, 0]
  ];
  const W = 1200, rowH = 64, top = 160, H = top + rows.length * rowH + 60;
  const lx = 60, zx = 640, scale = 230; // px per second
  let b = text(60, 64, "What didn't help", { size: 34, weight: 700 });
  b += text(60, 104, "Seconds added (right) or saved (left)", { size: 24, fill: C.muted });
  b += `<line x1="${zx}" y1="${top - 20}" x2="${zx}" y2="${top + rows.length * rowH - 6}" stroke="${C.faint}" stroke-width="2"/>`;
  for (const s of [-0.5, 0.5, 1, 1.5, 2]) {
    const gx = zx + s * scale;
    b += `<line x1="${gx}" y1="${top - 20}" x2="${gx}" y2="${top + rows.length * rowH - 6}" stroke="${C.grid}" stroke-width="1.5"/>`;
    b += text(gx, top + rows.length * rowH + 22, `${s > 0 ? "+" : ""}${s}s`, { size: 18, fill: C.faint, anchor: "middle", mono: true });
  }
  b += text(zx, top + rows.length * rowH + 22, "0", { size: 18, fill: C.faint, anchor: "middle", mono: true });
  rows.forEach(([name, what, a, z], i) => {
    const y = top + i * rowH, d = z - a;
    b += text(lx, y + 22, name, { size: 22, weight: 700 });
    b += text(lx, y + 46, what, { size: 18, fill: C.muted });
    const label = `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}s`;
    if (d >= 0) {
      b += hbar(zx, y + 8, Math.max(3, d * scale), 32, C.miss);
      b += text(zx + Math.max(3, d * scale) + 10, y + 32, label, { size: 20, weight: 700 });
    } else {
      const w = -d * scale;
      b += `<g transform="translate(${2 * zx},0) scale(-1,1)">${hbar(zx, y + 8, w, 32, C.miss)}</g>`;
      b += text(zx - w - 10, y + 32, label, { size: 20, weight: 700, anchor: "end" });
    }
  });
  svg("misses.svg", W, H, "What didn't help: downloading during resolve added 1.85s, fetching in workers added 0.3-0.7s, the rest moved under 0.2s", b);
}

// ---- 5. copy, hardlink or clone -----------------------------------------------------------

{
  // each group has its own scale; values are seconds
  const groups = [
    ["macOS APFS · place 7k files", [["copy", 0.702, C.other, "138 MB disk"], ["hardlink", 1.015, C.other, "2.7 MB disk"], ["clone", 0.555, C.fyn, "2.3 MB disk"]]],
    ["macOS APFS · place 37.6k files", [["copy", 4.85, C.other], ["clone each file", 3.18, C.other], ["clone each package dir", 0.61, C.fyn]]],
    ["Linux ext4 · fyn warm-cache install", [["copy mode, no store", 8.7, C.other], ["store + hardlink", 2.49, C.fyn]]]
  ];
  const W = 1200, lx = 60, bx = 380, bw = 560;
  let b = text(60, 64, "Copy, hardlink or clone", { size: 34, weight: 700 });
  b += text(60, 104, "Seconds, lower is faster. Each group has its own scale", { size: 24, fill: C.muted });
  let y = 160;
  for (const [title, bars] of groups) {
    const max = Math.max(...bars.map(r => r[1])) * 1.05;
    b += text(lx, y + 20, title, { size: 24, weight: 700 });
    y += 36;
    for (const [name, v, color, note] of bars) {
      const w = (v / max) * bw;
      b += text(lx, y + 30, name, { size: 22, fill: color === C.other ? C.muted : color, weight: color === C.other ? 400 : 700 });
      b += hbar(bx, y + 8, w, 32, color);
      b += text(bx + w + 12, y + 32, `${fmt(v)}s`, { size: 22, weight: 700, mono: true });
      if (note) b += text(W - 60, y + 32, note, { size: 20, fill: C.muted, anchor: "end" });
      y += 50;
    }
    y += 34;
  }
  const H = y + 30;
  svg("placement.svg", W, H, "On APFS clone is fastest and hardlink is slowest; one clone per package dir takes 0.61s against 4.85s to copy; on ext4 store + hardlink takes 2.49s against 8.70s for copy mode, which also skips the store", b);
}

// ---- 5b. pnpm 12 thread count on macOS -----------------------------------------------------

{
  const rows = [["14 threads (default)", 16.31], ["8 threads", 12.16], ["4 threads", 10.51], ["2 threads", 10.71]];
  const W = 1200, top = 160, rowH = 64, lx = 60, bx = 340, bw = 680, max = 17.5;
  const H = top + rows.length * rowH + 40;
  let b = text(60, 64, "pnpm 12 on macOS: fewer threads, faster", { size: 34, weight: 700 });
  b += text(60, 104, "Lockfile install on a 14-core M4 Pro, seconds, set with RAYON_NUM_THREADS", { size: 24, fill: C.muted });
  const best = Math.min(...rows.map(r => r[1]));
  rows.forEach(([name, v], i) => {
    const y = top + i * rowH, w = (v / max) * bw, isBest = v === best;
    b += text(lx, y + 32, name, { size: 22, weight: isBest ? 700 : 400, fill: isBest ? C.ink : C.muted });
    b += hbar(bx, y + 8, w, 36, isBest ? C.pnpm12 : "#f2b498");
    b += text(bx + w + 12, y + 34, fmt(v), { size: 22, weight: 700, mono: true });
  });
  svg("pnpm12-threads.svg", W, H, "pnpm 12 lockfile install on macOS: 16.31s with 14 threads, 12.16s with 8, 10.51s with 4, 10.71s with 2", b);
}

// ---- 6. results ----------------------------------------------------------------------------

{
  const tools = [["npm", C.other], ["pnpm 11", C.other], ["pnpm 12 (Rust)", C.pnpm12], ["fyn (Node.js)", C.fyn]];
  const panels = [
    ["Mac · clean", [13.51, 9.0, 18.01, 5.82], 35],
    ["Mac · warm cache", [6.22, 6.08, 2.98, 1.7], 17],
    ["Linux · clean", [34.57, 10.14, 4.54, 7.11], 35],
    ["Linux · warm cache", [14.82, 5.89, 1.25, 2.49], 17]
  ];
  const W = 1200, H = 760, colW = 540, padL = 60, gapX = 60, top = 160, panelH = 280, rowH = 52, labW = 190;
  let b = text(60, 64, "Install time, seconds (lower is faster)", { size: 34, weight: 700 });
  b += text(60, 104, "pnpm's benchmark, 1.3k packages, 15 ms simulated registry latency", { size: 24, fill: C.muted });
  panels.forEach(([title, vals, max], p) => {
    const px = padL + (p % 2) * (colW + gapX), py = top + Math.floor(p / 2) * panelH;
    b += text(px, py + 10, title, { size: 24, weight: 700 });
    const bw = colW - labW - 70;
    vals.forEach((v, i) => {
      const y = py + 30 + i * rowH, [name, color] = tools[i];
      b += text(px, y + 28, name, { size: 20, fill: color === C.other ? C.muted : color, weight: color === C.other ? 400 : 700 });
      const w = (v / max) * bw;
      b += hbar(px + labW, y + 8, w, 30, color);
      b += text(px + labW + w + 8, y + 31, fmt(v), { size: 20, weight: 700, mono: true });
    });
  });
  svg("results.svg", W, H, "Install times: fyn is fastest on Mac, pnpm 12 is fastest on Linux, both far ahead of npm", b);
}

// ---- 6b. peak memory ------------------------------------------------------------------------

{
  // max RSS in MB, median of 3 rounds, from notes/fyn-install-perf.md "Memory"
  const tools = [["npm", C.other], ["pnpm 11", C.other], ["pnpm 12 (Rust)", C.pnpm12], ["fyn (Node.js)", C.fyn]];
  const panels = [
    ["Mac · clean", [705, 1434, 474, 672]],
    ["Mac · warm cache", [1243, 1038, 177, 457]],
    ["Linux · clean", [610, 976, 399, 841]],
    ["Linux · warm cache", [1026, 660, 162, 359]]
  ];
  const max = 1500;
  const W = 1200, H = 760, colW = 540, padL = 60, gapX = 60, top = 160, panelH = 280, rowH = 52, labW = 190;
  let b = text(60, 64, "Peak memory, MB (lower is better)", { size: 34, weight: 700 });
  b += text(60, 104, "Max RSS, median of 3 runs, installing from registry.npmjs.org", { size: 24, fill: C.muted });
  panels.forEach(([title, vals], p) => {
    const px = padL + (p % 2) * (colW + gapX), py = top + Math.floor(p / 2) * panelH;
    b += text(px, py + 10, title, { size: 24, weight: 700 });
    const bw = colW - labW - 80;
    vals.forEach((v, i) => {
      const y = py + 30 + i * rowH, [name, color] = tools[i];
      b += text(px, y + 28, name, { size: 20, fill: color === C.other ? C.muted : color, weight: color === C.other ? 400 : 700 });
      const w = (v / max) * bw;
      b += hbar(px + labW, y + 8, w, 30, color);
      b += text(px + labW + w + 8, y + 31, v.toLocaleString("en-US"), { size: 20, weight: 700, mono: true });
    });
  });
  svg("memory.svg", W, H, "Peak memory: pnpm 12 is lowest everywhere; fyn peaks 1.4-2.1x higher clean and 2.2-2.6x higher warm, below pnpm 11 on every row", b);
}

// ---- 7. how much does rust bring -----------------------------------------------------------

{
  const lines = [
    ["Linux · clean install", 10.14, 7.11, 4.54, 11],
    ["Linux · warm cache", 5.89, 2.49, 1.25, 6.5]
  ];
  const W = 1200, H = 660, x0 = 120, x1 = 1100;
  let b = text(60, 64, "How much of pnpm 12's gain needs Rust?", { size: 34, weight: 700 });
  b += text(60, 104, "Seconds, lower is better. The bracket is what pnpm 12 saved over pnpm 11", { size: 24, fill: C.muted });
  lines.forEach(([title, p11, fyn, p12, max], k) => {
    const y = 230 + k * 240, X = v => x0 + (v / max) * (x1 - x0);
    const share = (p11 - fyn) / (p11 - p12);
    b += text(60, y - 60, title, { size: 24, weight: 700 });
    b += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.grid}" stroke-width="3"/>`;
    b += text(x0 - 14, y + 7, "0s", { size: 18, fill: C.faint, anchor: "end" });
    b += text(x1 + 14, y + 7, `${max}s`, { size: 18, fill: C.faint });
    // gap bracket pnpm 11 -> pnpm 12, with fyn's share filled
    b += `<rect x="${X(p12)}" y="${y - 12}" width="${X(p11) - X(p12)}" height="24" rx="4" fill="${C.pnpm12}" opacity="0.18"/>`;
    b += `<rect x="${X(fyn)}" y="${y - 12}" width="${X(p11) - X(fyn)}" height="24" rx="4" fill="${C.fyn}" opacity="0.85"/>`;
    for (const [v, name, color, up] of [[p11, "pnpm 11", C.muted, true], [fyn, "fyn", C.fyn, false], [p12, "pnpm 12", C.pnpm12, true]]) {
      b += `<circle cx="${X(v)}" cy="${y}" r="9" fill="${color}" stroke="${C.bg}" stroke-width="3"/>`;
      const ty = up ? y - 26 : y + 46;
      b += text(X(v), ty, `${name} ${fmt(v)}`, { size: 20, weight: 700, fill: color === C.muted ? C.ink : color, anchor: "middle" });
    }
    b += text((X(p11) + X(fyn)) / 2, y + 86, `fyn covers ${Math.round(share * 100)}% of the gap in Node.js`, { size: 20, fill: C.fyn, weight: 700, anchor: "middle" });
  });
  b += text(x0, H - 36, "← faster", { size: 18, fill: C.faint });
  b += text(x1, H - 36, "slower →", { size: 18, fill: C.faint, anchor: "end" });
  svg("rust-gap.svg", W, H, "On Linux, fyn in Node.js covers 54% of pnpm 12's clean-install gain over pnpm 11, and 73% on a warm cache", b);
}

console.log("figures written to", out.pathname);

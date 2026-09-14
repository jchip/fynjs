import os from "node:os";
import { performance } from "node:perf_hooks";

import { TagRenderer, createTemplateTagsFromArray } from "../dist/index.js";

const PAYLOAD_BYTES = 64 * 1024;
const CASES = [1, 16, 256, 4_096];
const HTML_UNIT =
  '<main><section class="card"><h2>Static title</h2><p>Static content.</p></section></main>';
const EXPECTED = HTML_UNIT.repeat(Math.ceil(PAYLOAD_BYTES / HTML_UNIT.length)).slice(
  0,
  PAYLOAD_BYTES,
);

const smoke = process.argv.includes("--smoke");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--smoke");
if (unknownArguments.length > 0) {
  throw new Error(`Unknown static benchmark argument: ${unknownArguments.join(" ")}`);
}

const options = smoke
  ? { samples: 5, targetBatchMs: 15, warmupMs: 25 }
  : { samples: 25, targetBatchMs: 100, warmupMs: 250 };

function splitStaticPayload(count) {
  const width = EXPECTED.length / count;
  return Array.from({ length: count }, (_, index) => ({
    str: EXPECTED.slice(index * width, (index + 1) * width),
  }));
}

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function assertResult(result) {
  if (
    typeof result !== "string" ||
    result.length !== EXPECTED.length ||
    result.charCodeAt(0) !== EXPECTED.charCodeAt(0) ||
    result.charCodeAt(result.length >> 1) !== EXPECTED.charCodeAt(EXPECTED.length >> 1) ||
    result.charCodeAt(result.length - 1) !== EXPECTED.charCodeAt(EXPECTED.length - 1)
  ) {
    throw new Error("static render benchmark produced invalid output");
  }
}

async function renderBatch(renderer, iterations) {
  let result;
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    const context = await renderer.render({});
    if (context.error) throw context.error;
    result = context.result;
  }
  const elapsed = performance.now() - start;
  assertResult(result);
  return elapsed;
}

async function calibrate(renderer) {
  let iterations = 1;
  let elapsed = 0;
  while (elapsed < options.targetBatchMs / 2) {
    elapsed = await renderBatch(renderer, iterations);
    if (elapsed < options.targetBatchMs / 2) iterations *= 2;
  }
  return Math.max(1, Math.round((iterations * options.targetBatchMs) / elapsed));
}

async function benchmarkCase(staticTags) {
  const renderer = new TagRenderer({
    templateTags: createTemplateTagsFromArray(splitStaticPayload(staticTags)),
  });
  await renderer.initializeRenderer();
  const initial = await renderer.render({});
  if (initial.result !== EXPECTED) throw new Error("static render benchmark output mismatch");

  const iterations = await calibrate(renderer);
  const warmupDeadline = performance.now() + options.warmupMs;
  do {
    await renderBatch(renderer, iterations);
  } while (performance.now() < warmupDeadline);

  const samples = [];
  for (let index = 0; index < options.samples; index++) {
    samples.push(((await renderBatch(renderer, iterations)) * 1_000_000) / iterations);
  }
  const final = await renderer.render({});
  if (final.result !== EXPECTED) throw new Error("static render benchmark final output mismatch");

  const meanNs = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  samples.sort((left, right) => left - right);
  const medianNs = percentile(samples, 0.5);
  const p95Ns = percentile(samples, 0.95);
  const deviations = samples.map((sample) => Math.abs(sample - medianNs)).sort((a, b) => a - b);
  const madPercent = (percentile(deviations, 0.5) / medianNs) * 100;
  const rendersPerSecond = 1_000_000_000 / medianNs;
  const logicalMibPerSecond = (rendersPerSecond * PAYLOAD_BYTES) / (1024 * 1024);

  return {
    iterations,
    madPercent,
    meanNs,
    medianNs,
    logicalMibPerSecond,
    p95Ns,
    rendersPerSecond,
    staticTags,
  };
}

const results = [];
for (const staticTags of CASES) {
  results.push(await benchmarkCase(staticTags));
}

const rows = results.map((result) => [
  `static-${result.staticTags}`,
  String(result.staticTags),
  result.iterations.toLocaleString("en-US"),
  (result.meanNs / 1_000).toFixed(3),
  (result.medianNs / 1_000).toFixed(3),
  (result.p95Ns / 1_000).toFixed(3),
  result.rendersPerSecond.toLocaleString("en-US", { maximumFractionDigits: 0 }),
  result.logicalMibPerSecond.toLocaleString("en-US", { maximumFractionDigits: 1 }),
  (result.medianNs / result.staticTags).toFixed(1),
  `${result.madPercent.toFixed(2)}%`,
]);
const headings = [
  "Case",
  "Tags",
  "Iterations",
  "Avg/render (µs)",
  "Median/render (µs)",
  "p95/render (µs)",
  "Renders/s",
  "Logical MiB/s",
  "Median ns/tag",
  "MAD",
];
const widths = headings.map((heading, index) =>
  Math.max(heading.length, ...rows.map((row) => row[index].length)),
);
const formatRow = (row) =>
  row.map((cell, index) => cell[index === 0 ? "padEnd" : "padStart"](widths[index])).join("  ");

console.log("Static render benchmark");
console.log(`Runtime:  Node ${process.version} · ${process.platform}/${process.arch}`);
console.log(`CPU:      ${os.cpus()[0]?.model ?? "unknown"}`);
console.log(
  `Workload: ${(PAYLOAD_BYTES / 1024).toFixed(0)} KiB static output · no async work or JavaScript hooks`,
);
console.log(
  `Sampling: ${smoke ? "smoke" : "full"} · ${options.samples} samples · ${options.targetBatchMs} ms target batch · ${options.warmupMs} ms warmup`,
);
console.log();
console.log(formatRow(headings));
console.log(formatRow(widths.map((width) => "-".repeat(width))));
for (const row of rows) console.log(formatRow(row));

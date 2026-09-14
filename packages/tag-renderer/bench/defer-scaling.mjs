import { once } from "node:events";
import { performance } from "node:perf_hooks";

import { TagRenderer, createTemplateTags, createTemplateTagsFromArray } from "../dist/index.js";

const immediate = () => new Promise((resolve) => setImmediate(resolve));

async function throughput(count, limit) {
  let active = 0;
  let peak = 0;
  const tags = Array.from({ length: count }, () => (context) => {
    context.defer(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return "x";
    });
  });
  const renderer = new TagRenderer({
    templateTags: createTemplateTagsFromArray(tags),
    deferConcurrency: limit,
  });

  const start = performance.now();
  const result = await renderer.render({});
  const elapsed = performance.now() - start;
  if (result.result.length !== count || peak > limit) throw new Error("invalid defer result");
  console.log(`throughput\t${count}\tlimit=${limit}\t${elapsed.toFixed(2)} ms\tpeak=${peak}`);
}

async function slowHead(count, limit) {
  let releaseHead;
  const head = new Promise((resolve) => {
    releaseHead = resolve;
  });
  let started = 0;
  const tags = Array.from({ length: count }, (_, index) => (context) => {
    context.defer(() => {
      started++;
      return index === 0 ? head : "";
    });
  });
  const renderer = new TagRenderer({
    templateTags: createTemplateTagsFromArray(tags),
    deferConcurrency: limit,
  });

  const rendering = renderer.render({});
  await immediate();
  if (started !== limit) throw new Error(`slow head started ${started}; expected ${limit}`);
  const startedWhileBlocked = started;
  const heapWhileBlocked = process.memoryUsage().heapUsed;
  releaseHead("");
  await rendering;
  console.log(
    `slow-head\t${count}\tlimit=${limit}\tstarted-while-blocked=${startedWhileBlocked}\theap=${Math.round(heapWhileBlocked / 1024 / 1024)} MiB`,
  );
}

async function earlyFirstByte() {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const renderer = new TagRenderer({
    templateTags: createTemplateTags`prefix${() => gate}tail`,
  });
  await renderer.initializeRenderer();

  const start = performance.now();
  const handle = renderer.renderStream();
  const [chunk] = await once(handle.stream, "data");
  const firstByte = performance.now() - start;
  if (String(chunk) !== "prefix") throw new Error("early stream emitted the wrong prefix");
  release("middle");
  await Promise.all([once(handle.stream, "end"), handle.completed]);
  console.log(`early-first-byte\t${firstByte.toFixed(2)} ms`);
}

for (const count of [100, 1_000, 10_000]) {
  for (const limit of [1, 8, 32]) await throughput(count, limit);
}
await slowHead(100_000, 8);
await earlyFirstByte();

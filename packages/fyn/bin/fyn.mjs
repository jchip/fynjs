#!/usr/bin/env node

import "./check-node.mjs";
import module from "node:module";

// V8 caches the compiled bundle on disk (under the OS temp dir, or NODE_COMPILE_CACHE), which
// cuts about 25ms off every run after the first. NODE_DISABLE_COMPILE_CACHE=1 turns it off.
module.enableCompileCache?.();

// dynamic so the version check above runs first - see check-node.mjs
const { run } = await import("./index.mjs");

try {
  await run();
  // no argument, so a code the CLI parser set (e.g. 1 on a parse error) is kept
  process.exit();
} catch (err) {
  console.error(err);
  process.exit(1);
}

#!/usr/bin/env node

import "./check-node.mjs";

// dynamic so the version check above runs first - see check-node.mjs
const { run } = await import("./index.mjs");

try {
  await run();
  process.exit(0);
} catch (err) {
  console.log(err);
  process.exit(1);
}

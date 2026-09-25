#!/usr/bin/env node

import "./check-node.mjs";

// dynamic so the version check above runs first - see check-node.mjs
const { fun } = await import("./index.mjs");

try {
  await fun();
  // no argument, so a code the CLI parser set (e.g. 1 on a parse error) is kept
  process.exit();
} catch (err) {
  console.error(err);
  process.exit(1);
}

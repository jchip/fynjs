#!/usr/bin/env node

import "./check-node.mjs";

// dynamic so the version check above runs first - see check-node.mjs
const { fun } = await import("./index.mjs");

try {
  await fun();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}

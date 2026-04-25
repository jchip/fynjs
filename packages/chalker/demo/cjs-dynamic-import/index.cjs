"use strict";

process.env.FORCE_COLOR = "1";

const assert = require("assert");

async function main() {
  const chalkerModule = await import("chalker");
  const chalker = chalkerModule.default;

  assert.equal(typeof chalker, "function");
  assert.equal(chalker("<green>ok</green>"), "\u001b[32mok\u001b[39m");
  assert.equal(chalker.remove("<red>plain</red>"), "plain");

  console.log("cjs-dynamic-import ok");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

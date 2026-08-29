"use strict";

process.env.FORCE_COLOR = "1";

const assert = require("assert");
const ansiColors = require("ansi-colors");

//
// As of chalker 2.0 a CJS file cannot require("chalker") - chalker uses top-level await to
// optionally load ESM-only chalk, and require() of such a graph throws ERR_REQUIRE_ASYNC_MODULE.
// A dynamic import is the CJS migration path, and it still reaches CJS-only ansi-colors just
// fine: import() handles both CJS and ESM.
//
async function main() {
  const chalker = (await import("chalker")).default;

  ansiColors.enabled = true;
  chalker.CHALK = ansiColors;

  assert.equal(typeof chalker, "function");
  assert.strictEqual(chalker.CHALK, ansiColors);
  assert.equal(chalker.remove("<red>plain</red>"), "plain");
  assert.equal(chalker("<red>ok</red>"), "\u001b[31mok\u001b[39m");
  assert.equal(
    chalker("<orange.bg(gold).hsl(32,100,50).bgHsv(120,100,50)>ok</>"),
    "\u001b[38;2;255;165;0m\u001b[48;2;255;215;0m\u001b[38;2;255;136;0m\u001b[48;2;0;128;0mok\u001b[49m\u001b[39m\u001b[49m\u001b[39m"
  );

  console.log("ansi-colors-cjs ok");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

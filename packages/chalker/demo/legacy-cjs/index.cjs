"use strict";

process.env.FORCE_COLOR = "1";

const assert = require("assert");

//
// As of chalker 2.0, a CJS file can no longer `require("chalker")`.
//
// chalker optionally loads ESM-only chalk, which can only be done with a dynamic import, so it
// uses top-level await. require() of an ESM graph containing top-level await always throws
// ERR_REQUIRE_ASYNC_MODULE - there is no node version where this works, because the
// incompatibility is semantic rather than a missing feature.
//
// This demo pins that break, and shows the migration.
//
assert.throws(
  () => require("chalker"),
  err => {
    assert.equal(err.code, "ERR_REQUIRE_ASYNC_MODULE");
    return true;
  },
  "expected require('chalker') to throw ERR_REQUIRE_ASYNC_MODULE"
);

// the migration: CJS consumers use a dynamic import
async function main() {
  const chalker = (await import("chalker")).default;

  assert.equal(typeof chalker, "function");
  assert.equal(chalker.remove("<red>plain</red>"), "plain");
  assert.equal(chalker("<red>ok</red>"), "\u001b[31mok\u001b[39m");
  assert.match(
    chalker("<orange.bg(gold).hsl(32,100,50).bgHsv(120,100,50)>ok</>"),
    /\u001b\[[\d;]+mok/
  );

  console.log("legacy-cjs ok");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

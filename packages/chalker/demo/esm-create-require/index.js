import assert from "node:assert";
import { createRequire } from "node:module";

process.env.FORCE_COLOR = "1";

const require = createRequire(import.meta.url);

//
// As of chalker 2.0, createRequire cannot load chalker either.
//
// createRequire hands back a real CJS require, so it hits the same wall as require() in a CJS
// file: chalker's graph contains top-level await (it optionally imports ESM-only chalk), and
// require() of such a graph throws ERR_REQUIRE_ASYNC_MODULE.
//
// This demo pins that break, and shows the migration.
//
assert.throws(
  () => require("chalker"),
  err => {
    assert.equal(err.code, "ERR_REQUIRE_ASYNC_MODULE");
    return true;
  },
  "expected createRequire()('chalker') to throw ERR_REQUIRE_ASYNC_MODULE"
);

// the migration: import it, which is the natural thing to do from ESM anyway
const chalker = (await import("chalker")).default;

assert.equal(typeof chalker, "function");
assert.equal(chalker("<cyan>ok</cyan>"), "\u001b[36mok\u001b[39m");
assert.equal(chalker.remove("<red>plain</red>"), "plain");

console.log("esm-create-require ok");

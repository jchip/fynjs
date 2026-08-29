import assert from "node:assert";
import { createRequire } from "node:module";

process.env.FORCE_COLOR = "1";

const require = createRequire(import.meta.url);
const chalker = require("chalker");

assert.equal(typeof chalker, "function");
assert.equal(chalker("<cyan>ok</cyan>"), "\u001b[36mok\u001b[39m");
assert.equal(chalker.remove("<red>plain</red>"), "plain");

console.log("esm-create-require ok");

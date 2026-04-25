import assert from "node:assert";
import * as chalkerModule from "chalker";

assert.equal(typeof chalkerModule.default, "function");
assert.equal(chalkerModule.default("<magenta>ok</magenta>"), "\u001b[35mok\u001b[39m");
assert.equal(chalkerModule.default.remove("<red>plain</red>"), "plain");

console.log("esm-namespace ok");

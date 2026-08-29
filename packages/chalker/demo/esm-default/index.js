import assert from "node:assert";
import chalker from "chalker";

assert.equal(typeof chalker, "function");
assert.equal(chalker("<blue>ok</blue>"), "\u001b[34mok\u001b[39m");
assert.equal(chalker.remove("<red>plain</red>"), "plain");

console.log("esm-default ok");

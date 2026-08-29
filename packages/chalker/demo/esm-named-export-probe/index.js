import assert from "node:assert";

try {
  await import("./probe.js");
  throw new Error("named export import unexpectedly worked");
} catch (err) {
  assert.equal(err.name, "SyntaxError");
  assert.match(err.message, /does not provide an export named 'remove'/);
}

console.log("esm-named-export-probe expected unsupported");

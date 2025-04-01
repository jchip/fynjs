const Promise = require("bluebird");

// Test disposer
console.log("\n=== Testing disposer ===");
const cleanup = (value, promise) => console.log("Cleanup:", value, promise);
const disposer = Promise.resolve().disposer(cleanup);
console.log("Disposer object:", disposer);
console.log("Disposer type:", typeof disposer);
console.log("Disposer properties:", Object.getOwnPropertyNames(disposer));
console.log("Disposer prototype:", Object.getPrototypeOf(disposer));

// Test using
console.log("\n=== Testing using ===");
const resource = Promise.resolve("resource").then((value) => ({
  value,
  dispose: Promise.resolve().disposer(cleanup).dispose,
}));

Promise.using(resource, (r) => {
  console.log("Using resource:", r);
  return "result";
}).then((result) => {
  console.log("Final result:", result);
});

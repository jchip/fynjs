const Promise = require("aveazul");
const fs = require("fs");

async function demoMap() {
  console.log("=== Demo: map with concurrency ===");
  const items = [1, 2, 3, 4, 5];
  const results = await Promise.map(
    items,
    async (item, index) => {
      console.log(`  Processing item ${item} at index ${index}`);
      await Promise.delay(100);
      return item * 2;
    },
    { concurrency: 2 }
  );
  console.log("  Results:", results);
}

async function demoDelay() {
  console.log("\n=== Demo: delay ===");
  console.log("  Waiting 200ms...");
  const result = await Promise.delay(200, "delayed value");
  console.log("  Got:", result);
}

async function demoPromisify() {
  console.log("\n=== Demo: promisify ===");
  const readFileAsync = Promise.promisify(fs.readFile);
  const content = await readFileAsync("package.json", "utf8");
  const pkg = JSON.parse(content);
  console.log("  Package name:", pkg.name);
}

async function demoProps() {
  console.log("\n=== Demo: props ===");
  const result = await Promise.props({
    a: Promise.delay(50, 1),
    b: Promise.delay(30, 2),
    c: Promise.resolve(3),
  });
  console.log("  Result:", result);
}

async function demoReduce() {
  console.log("\n=== Demo: reduce ===");
  const sum = await Promise.reduce(
    [1, 2, 3, 4, 5],
    async (acc, val) => {
      await Promise.delay(20);
      return acc + val;
    },
    0
  );
  console.log("  Sum:", sum);
}

async function demoUsing() {
  console.log("\n=== Demo: using with Disposer ===");

  function getResource(name) {
    console.log(`  Acquiring resource: ${name}`);
    const resource = { name, data: `Data for ${name}` };
    return Promise.resolve(resource).disposer(() => {
      console.log(`  Disposing resource: ${name}`);
    });
  }

  const result = await Promise.using(getResource("db-connection"), (resource) => {
    console.log(`  Using resource: ${resource.name}`);
    return resource.data;
  });
  console.log("  Result:", result);
}

async function main() {
  console.log("Promise CJS Demo\n");

  await demoMap();
  await demoDelay();
  await demoPromisify();
  await demoProps();
  await demoReduce();
  await demoUsing();

  console.log("\nAll demos completed successfully!");
}

main().catch(console.error);

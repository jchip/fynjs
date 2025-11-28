import { AveAzul } from "aveazul";
import fs from "fs";

async function demoMap() {
  console.log("=== Demo: map with concurrency ===");
  const items = [1, 2, 3, 4, 5];
  const results = await AveAzul.map(
    items,
    async (item, index) => {
      console.log(`  Processing item ${item} at index ${index}`);
      await AveAzul.delay(100);
      return item * 2;
    },
    { concurrency: 2 }
  );
  console.log("  Results:", results);
}

async function demoDelay() {
  console.log("\n=== Demo: delay ===");
  console.log("  Waiting 200ms...");
  const result = await AveAzul.delay(200, "delayed value");
  console.log("  Got:", result);
}

async function demoPromisify() {
  console.log("\n=== Demo: promisify ===");
  const readFileAsync = AveAzul.promisify(fs.readFile);
  const content = await readFileAsync("package.json", "utf8");
  const pkg = JSON.parse(content);
  console.log("  Package name:", pkg.name);
}

async function demoProps() {
  console.log("\n=== Demo: props ===");
  const result = await AveAzul.props({
    a: AveAzul.delay(50, 1),
    b: AveAzul.delay(30, 2),
    c: Promise.resolve(3),
  });
  console.log("  Result:", result);
}

async function demoReduce() {
  console.log("\n=== Demo: reduce ===");
  const sum = await AveAzul.reduce(
    [1, 2, 3, 4, 5],
    async (acc, val) => {
      await AveAzul.delay(20);
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
    return AveAzul.resolve(resource).disposer(() => {
      console.log(`  Disposing resource: ${name}`);
    });
  }

  const result = await AveAzul.using(getResource("db-connection"), (resource) => {
    console.log(`  Using resource: ${resource.name}`);
    return resource.data;
  });
  console.log("  Result:", result);
}

async function main() {
  console.log("AveAzul ESM Demo\n");

  await demoMap();
  await demoDelay();
  await demoPromisify();
  await demoProps();
  await demoReduce();
  await demoUsing();

  console.log("\nAll demos completed successfully!");
}

main().catch(console.error);

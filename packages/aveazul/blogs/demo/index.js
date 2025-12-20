const Bluebird = require("bluebird");
const Resource = require("./resource");

// Example 1: Basic usage with a single resource
async function basicExample() {
  console.log("\n=== Basic Example ===");
  try {
    const resource = new Resource("basic");

    // Pass the disposer to Bluebird.using
    const result = await Bluebird.using(
      resource.disposer(),
      async (resource) => {
        await resource.initialize();
        return await resource.doSomething();
      }
    );
    console.log("Result:", result);

    // Verify disposal
    console.log(`Resource disposed: ${resource.isDisposed}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Example 2: Multiple resources
async function multipleResourcesExample() {
  console.log("\n=== Multiple Resources Example ===");
  try {
    // Create resources first
    const dbResource = new Resource("db");
    const cacheResource = new Resource("cache");

    // Use multiple disposers with Bluebird.using
    const result = await Bluebird.using(
      dbResource.disposer(),
      cacheResource.disposer(),
      async (db, cache) => {
        await db.initialize();
        await cache.initialize();

        const dbResult = await db.query("SELECT * FROM users");
        const cachedData = await cache.get("user-data");

        return { dbResult, cachedData };
      }
    );

    console.log("Results:", result);

    // Verify disposal
    console.log(`DB Resource disposed: ${dbResource.isDisposed}`);
    console.log(`Cache Resource disposed: ${cacheResource.isDisposed}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Example 3: Error handling
async function errorHandlingExample() {
  console.log("\n=== Error Handling Example ===");
  const errorResource = new Resource("error");

  try {
    await Bluebird.using(errorResource.disposer(), async (resource) => {
      // This will throw an error because we're not initializing the resource
      await resource.doSomething();
    });
  } catch (error) {
    console.log("Caught error:", error.message);
    console.log("Resource was still disposed despite the error!");

    // Verify disposal
    console.log(`Resource disposed: ${errorResource.isDisposed}`);
  }
}

// Example 4: Complex resource management
async function complexExample() {
  console.log("\n=== Complex Resource Management Example ===");
  try {
    // Create resources first
    const dbResource = new Resource("db");
    const cacheResource = new Resource("cache");
    const fileResource = new Resource("file");
    const networkResource = new Resource("network");
    const memoryResource = new Resource("memory");

    // Use multiple disposers with Bluebird.using
    const result = await Bluebird.using(
      dbResource.disposer(),
      cacheResource.disposer(),
      fileResource.disposer(),
      networkResource.disposer(),
      memoryResource.disposer(),
      async (db, cache, file, network, memory) => {
        // Initialize all resources
        await db.initialize();
        await cache.initialize();
        await file.initialize();
        await network.initialize();
        await memory.initialize();

        // Use resources in sequence
        const dbResult = await db.query("SELECT * FROM users");
        const cachedData = await cache.get("user-data");
        const fileContent = await file.read("config.json");
        const networkData = await network.fetch("https://api.example.com/data");

        return {
          dbResult,
          cachedData,
          fileContent,
          networkData,
        };
      }
    );

    console.log("Complex operation results:", result);

    // Verify disposal
    console.log("\nResource Disposal Verification:");
    console.log(`DB Resource disposed: ${dbResource.isDisposed}`);
    console.log(`Cache Resource disposed: ${cacheResource.isDisposed}`);
    console.log(`File Resource disposed: ${fileResource.isDisposed}`);
    console.log(`Network Resource disposed: ${networkResource.isDisposed}`);
    console.log(`Memory Resource disposed: ${memoryResource.isDisposed}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run all examples
async function runExamples() {
  console.log("Bluebird using() Method Demo\n");

  await basicExample();
  await multipleResourcesExample();
  await errorHandlingExample();
  await complexExample();

  console.log("\nAll examples completed!");
}

// Run the examples
runExamples().catch((error) => {
  console.error("Unhandled error:", error);
});

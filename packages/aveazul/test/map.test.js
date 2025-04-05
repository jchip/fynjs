"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.map", () => {
  test("should transform array elements", async () => {
    const result = await AveAzul.map([1, 2, 3], (x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle empty arrays", async () => {
    const result = await AveAzul.map([], (x) => x * 2);
    expect(result).toEqual([]);
  });

  test("should handle array with promise values", async () => {
    const input = [Promise.resolve(1), 2, AveAzul.resolve(3)];

    const result = await AveAzul.map(input, (x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle mapper function returning promises", async () => {
    const result = await AveAzul.map([1, 2, 3], (x) => Promise.resolve(x * 2));
    expect(result).toEqual([2, 4, 6]);
  });

  test("should preserve order of results", async () => {
    // Create delays that would complete out of order if run in parallel without preserving order
    const result = await AveAzul.map([30, 10, 20], (x) => {
      return new Promise((resolve) => setTimeout(() => resolve(x), x));
    });
    expect(result).toEqual([30, 10, 20]);
  });

  test("should process items concurrently with explicit concurrency", async () => {
    const items = [1, 2, 3];
    const startTimes = [];
    const startTime = Date.now();

    const results = await AveAzul.map(
      items,
      async (item, index) => {
        // Record when this function was called relative to test start
        startTimes.push(Date.now() - startTime);

        // Different delays based on index
        if (index === 0)
          await new Promise((resolve) => setTimeout(resolve, 100));
        else if (index === 1)
          await new Promise((resolve) => setTimeout(resolve, 50));
        // No delay for index 2

        return item;
      },
      { concurrency: 3 }
    );

    // Verify results are in correct order
    expect(results).toEqual(items);

    // With concurrency 3, all operations should start within a short time window
    expect(startTimes[1] < 20 && startTimes[2] < 20).toBe(true);
  });

  test("should respect concurrency option", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const startTimes = [];
    const startTime = Date.now();
    const inProgress = new Set();
    const maxConcurrent = { value: 0 };

    const results = await AveAzul.map(
      items,
      async (item, index) => {
        // Record when this function was called relative to test start
        startTimes.push(Date.now() - startTime);

        // Track currently executing tasks
        inProgress.add(index);
        maxConcurrent.value = Math.max(maxConcurrent.value, inProgress.size);

        // Add different delays
        const delay = 20 * (index + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Remove from in-progress set
        inProgress.delete(index);

        return item;
      },
      { concurrency: 3 }
    );

    // Verify results are in correct order
    expect(results).toEqual(items);

    // Check that all mapping operations started within a reasonable time frame

    // Verify that we had at most 3 concurrent operations
    expect(maxConcurrent.value).toBe(3);
  });

  test("should default to concurrent processing", async () => {
    const items = [1, 2, 3];
    const executionOrder = [];
    const startTimes = [];
    const startTime = Date.now();

    const results = await AveAzul.map(items, async (item, index) => {
      // Record when this function was called relative to test start
      startTimes.push(Date.now() - startTime);

      // Record the start of execution
      executionOrder.push(`start-${index}`);

      // Add delays to make the test more reliable
      const delay = 20 * (index + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Record the end of execution
      executionOrder.push(`end-${index}`);
      return item;
    });

    // Verify results are in correct order
    expect(results).toEqual(items);

    // In concurrent processing, we expect all items to start within a short time window
    const allStartedConcurrently = startTimes.every((time) => time < 20);
    expect(allStartedConcurrently).toBe(true);

    // Also verify by checking that at least one item started before the first item finished
    // If execution was sequential, we would see start-0, end-0, start-1, end-1, ...
    // With concurrent execution, we'll see multiple starts before the first end
    const firstEndIndex = executionOrder.findIndex((event) =>
      event.startsWith("end-")
    );
    const startCountBeforeFirstEnd = executionOrder
      .slice(0, firstEndIndex)
      .filter((event) => event.startsWith("start-")).length;

    // In true concurrent execution, all 3 items should start before any completes
    expect(startCountBeforeFirstEnd).toBeGreaterThan(1);
  });
});

describe("AveAzul.prototype.map", () => {
  test("should transform array elements", async () => {
    const result = await new AveAzul((resolve) => resolve([1, 2, 3])).map(
      (x) => x * 2
    );

    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle empty arrays", async () => {
    const result = await AveAzul.resolve([]).map((x) => x * 2);
    expect(result).toEqual([]);
  });

  test("should handle array with promise values", async () => {
    const input = [Promise.resolve(1), 2, AveAzul.resolve(3)];

    const result = await AveAzul.resolve(input).map((x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle mapper function returning promises", async () => {
    const result = await AveAzul.resolve([1, 2, 3]).map((x) =>
      Promise.resolve(x * 2)
    );
    expect(result).toEqual([2, 4, 6]);
  });

  test("should preserve order of results", async () => {
    // Create delays that would complete out of order if run in parallel without preserving order
    const result = await AveAzul.resolve([30, 10, 20]).map((x) => {
      return new Promise((resolve) => setTimeout(() => resolve(x), x));
    });
    expect(result).toEqual([30, 10, 20]);
  });

  test("should process items concurrently with explicit concurrency", async () => {
    const items = [1, 2, 3];
    const startTimes = [];
    const startTime = Date.now();

    const results = await AveAzul.resolve(items).map(
      async (item, index) => {
        // Record when this function was called relative to test start
        startTimes.push(Date.now() - startTime);

        // Different delays based on index
        if (index === 0)
          await new Promise((resolve) => setTimeout(resolve, 100));
        else if (index === 1)
          await new Promise((resolve) => setTimeout(resolve, 50));
        // No delay for index 2

        return item;
      },
      { concurrency: 3 }
    );

    // Verify results are in correct order
    expect(results).toEqual(items);

    // With concurrency 3, all operations should start within a short time window
    expect(startTimes[1] < 20 && startTimes[2] < 20).toBe(true);
  });

  test("should respect concurrency option", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    const startTimes = [];
    const startTime = Date.now();
    const inProgress = new Set();
    const maxConcurrent = { value: 0 };

    const results = await AveAzul.resolve(items).map(
      async (item, index) => {
        // Record when this function was called relative to test start
        startTimes.push(Date.now() - startTime);

        // Track currently executing tasks
        inProgress.add(index);
        maxConcurrent.value = Math.max(maxConcurrent.value, inProgress.size);

        // Add different delays
        const delay = 20 * (index + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Remove from in-progress set
        inProgress.delete(index);

        return item;
      },
      { concurrency: 3 }
    );

    // Verify results are in correct order
    expect(results).toEqual(items);

    // Verify that we had at most 3 concurrent operations
    expect(maxConcurrent.value).toBe(3);
  });

  test("should default to concurrent processing", async () => {
    const items = [1, 2, 3];
    const executionOrder = [];
    const startTimes = [];
    const startTime = Date.now();

    const results = await AveAzul.resolve(items).map(async (item, index) => {
      // Record when this function was called relative to test start
      startTimes.push(Date.now() - startTime);

      // Record the start of execution
      executionOrder.push(`start-${index}`);

      // Add delays to make the test more reliable
      const delay = 20 * (index + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Record the end of execution
      executionOrder.push(`end-${index}`);
      return item;
    });

    // Verify results are in correct order
    expect(results).toEqual(items);

    // In concurrent processing, we expect all items to start within a short time window
    const allStartedConcurrently = startTimes.every((time) => time < 20);
    expect(allStartedConcurrently).toBe(true);

    // Also verify by checking that at least one item started before the first item finished
    // If execution was sequential, we would see start-0, end-0, start-1, end-1, ...
    // With concurrent execution, we'll see multiple starts before the first end
    const firstEndIndex = executionOrder.findIndex((event) =>
      event.startsWith("end-")
    );
    const startCountBeforeFirstEnd = executionOrder
      .slice(0, firstEndIndex)
      .filter((event) => event.startsWith("start-")).length;

    // In true concurrent execution, all 3 items should start before any completes
    expect(startCountBeforeFirstEnd).toBeGreaterThan(1);
  });
});

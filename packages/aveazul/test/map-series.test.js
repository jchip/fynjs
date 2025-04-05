"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.mapSeries", () => {
  test("should transform array elements", async () => {
    const result = await AveAzul.mapSeries([1, 2, 3], (x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle empty arrays", async () => {
    const result = await AveAzul.mapSeries([], (x) => x * 2);
    expect(result).toEqual([]);
  });

  test("should handle array with promise values", async () => {
    const input = [Promise.resolve(1), 2, AveAzul.resolve(3)];

    const result = await AveAzul.mapSeries(input, (x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle mapper function returning promises", async () => {
    const result = await AveAzul.mapSeries([1, 2, 3], (x) =>
      Promise.resolve(x * 2)
    );
    expect(result).toEqual([2, 4, 6]);
  });

  test("should process items in series (one after another)", async () => {
    // Track execution to verify serial processing
    const executionOrder = [];
    const startTimes = [];
    const endTimes = [];

    // Function that simulates async processing with different durations
    const asyncMapper = async (item) => {
      const delay = item * 10; // Different delay based on item value
      const startTime = Date.now();
      startTimes.push({ item, time: startTime });
      executionOrder.push(`start-${item}`);

      await new Promise((resolve) => setTimeout(resolve, delay));

      const endTime = Date.now();
      endTimes.push({ item, time: endTime });
      executionOrder.push(`end-${item}`);

      return item * 2;
    };

    // Map items with the asyncMapper
    const result = await AveAzul.mapSeries([3, 1, 2], asyncMapper);

    // Verify correct result values
    expect(result).toEqual([6, 2, 4]);

    // Verify serial execution - each item should start only after the previous one ends
    expect(executionOrder).toEqual([
      "start-3",
      "end-3", // First item starts and completes
      "start-1",
      "end-1", // Second item starts only after first is done
      "start-2",
      "end-2", // Third item starts only after second is done
    ]);

    // Additional verification by checking timestamps
    for (let i = 1; i < startTimes.length; i++) {
      // Each item should start after the previous item ends
      expect(startTimes[i].time).toBeGreaterThanOrEqual(endTimes[i - 1].time);
    }
  });
});

describe("AveAzul.prototype.mapSeries", () => {
  test("should transform array elements", async () => {
    const result = await AveAzul.resolve([1, 2, 3]).mapSeries((x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle empty arrays", async () => {
    const result = await AveAzul.resolve([]).mapSeries((x) => x * 2);
    expect(result).toEqual([]);
  });

  test("should handle array with promise values", async () => {
    const input = [Promise.resolve(1), 2, AveAzul.resolve(3)];

    const result = await AveAzul.resolve(input).mapSeries((x) => x * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  test("should handle mapper function returning promises", async () => {
    const result = await AveAzul.resolve([1, 2, 3]).mapSeries((x) =>
      Promise.resolve(x * 2)
    );
    expect(result).toEqual([2, 4, 6]);
  });

  test("should process items in series (one after another)", async () => {
    // Track execution to verify serial processing
    const executionOrder = [];
    const startTimes = [];
    const endTimes = [];

    // Function that simulates async processing with different durations
    const asyncMapper = async (item) => {
      const delay = item * 10; // Different delay based on item value
      const startTime = Date.now();
      startTimes.push({ item, time: startTime });
      executionOrder.push(`start-${item}`);

      await new Promise((resolve) => setTimeout(resolve, delay));

      const endTime = Date.now();
      endTimes.push({ item, time: endTime });
      executionOrder.push(`end-${item}`);

      return item * 2;
    };

    // Map items with the asyncMapper
    const result = await AveAzul.resolve([3, 1, 2]).mapSeries(asyncMapper);

    // Verify correct result values
    expect(result).toEqual([6, 2, 4]);

    // Verify serial execution - each item should start only after the previous one ends
    expect(executionOrder).toEqual([
      "start-3",
      "end-3", // First item starts and completes
      "start-1",
      "end-1", // Second item starts only after first is done
      "start-2",
      "end-2", // Third item starts only after second is done
    ]);

    // Additional verification by checking timestamps
    for (let i = 1; i < startTimes.length; i++) {
      // Each item should start after the previous item ends
      expect(startTimes[i].time).toBeGreaterThanOrEqual(endTimes[i - 1].time);
    }
  });
});

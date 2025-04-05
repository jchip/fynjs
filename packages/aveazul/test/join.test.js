"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.join", () => {
  test("should wait for all promises and pass their values to the handler", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3),
      (a, b, c) => a + b + c
    );

    expect(result).toBe(6);
  });

  test("should handle a mix of promises and values", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      2,
      AveAzul.resolve(3),
      (a, b, c) => a + b + c
    );

    expect(result).toBe(6);
  });

  test("should handle zero promises with only a handler", async () => {
    const fn = () => 42;
    const result = await AveAzul.join(fn);
    expect(result).toEqual([fn]);
  });

  test("should reject if any input promise rejects", async () => {
    await expect(
      AveAzul.join(
        AveAzul.resolve(1),
        AveAzul.reject(new Error("test error")),
        AveAzul.resolve(3),
        (a, b, c) => a + b + c
      )
    ).rejects.toThrow("test error");
  });

  test("should reject with error from handler function", async () => {
    await expect(
      AveAzul.join(AveAzul.resolve(1), AveAzul.resolve(2), () => {
        throw new Error("handler error");
      })
    ).rejects.toThrow("handler error");
  });

  test("should handle asynchronous handler functions", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      async (a, b) => {
        const c = await AveAzul.resolve(3);
        return a + b + c;
      }
    );

    expect(result).toBe(6);
  });

  test("should maintain the order of values passed to handler", async () => {
    // Create promises that resolve at different times
    const p1 = new AveAzul((resolve) => setTimeout(() => resolve("first"), 30));
    const p2 = new AveAzul((resolve) =>
      setTimeout(() => resolve("second"), 10)
    );
    const p3 = new AveAzul((resolve) => setTimeout(() => resolve("third"), 20));

    const result = await AveAzul.join(p1, p2, p3, (a, b, c) => [a, b, c]);

    // Order should be maintained regardless of resolution timing
    expect(result).toEqual(["first", "second", "third"]);
  });

  test("should correctly handle promises that resolve to undefined or null", async () => {
    const result = await AveAzul.join(
      AveAzul.resolve(undefined),
      AveAzul.resolve(null),
      AveAzul.resolve(42),
      (a, b, c) => ({ a, b, c })
    );

    expect(result).toEqual({ a: undefined, b: null, c: 42 });
  });

  test("should catch errors thrown in promises", async () => {
    // Create a promise that throws instead of rejecting normally
    const throwingPromise = new AveAzul(() => {
      throw new Error("thrown error");
    });

    await expect(
      AveAzul.join(
        AveAzul.resolve(1),
        throwingPromise,
        AveAzul.resolve(3),
        (a, b, c) => a + b + c
      )
    ).rejects.toThrow("thrown error");
  });

  test("should behave like Promise.all when last argument is not a function", async () => {
    // When the last argument is not a function, join should behave like Promise.all
    const result = await AveAzul.join(
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3)
    );

    // Should return an array of results, just like Promise.all
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, 2, 3]);
  });

  test("should process all promises even when handler takes fewer parameters", async () => {
    // Create spy promises to track resolution
    const spy1 = jest.fn().mockResolvedValue(1);
    const spy2 = jest.fn().mockResolvedValue(2);
    const spy3 = jest.fn().mockResolvedValue(3);
    const spy4 = jest.fn().mockResolvedValue(4);

    // Handler only uses the first two values
    const result = await AveAzul.join(
      spy1(),
      spy2(),
      spy3(),
      spy4(),
      (a, b) => a + b
    );

    // Result should be the sum of first two values
    expect(result).toBe(3);

    // All spies should have been called, showing all promises were processed
    expect(spy1).toHaveBeenCalled();
    expect(spy2).toHaveBeenCalled();
    expect(spy3).toHaveBeenCalled();
    expect(spy4).toHaveBeenCalled();
  });

  test("should handle nested join calls", async () => {
    // Create an inner join that resolves to the sum of 3 numbers
    const innerJoin = AveAzul.join(
      AveAzul.resolve(1),
      AveAzul.resolve(2),
      AveAzul.resolve(3),
      (a, b, c) => a + b + c
    );

    // Create a second inner join that multiplies 2 numbers
    const secondInnerJoin = AveAzul.join(
      AveAzul.resolve(4),
      AveAzul.resolve(5),
      (a, b) => a * b
    );

    // Create a third promise that resolves to a number
    const thirdPromise = new AveAzul((resolve) =>
      setTimeout(() => resolve(10), 20)
    );

    // Outer join that combines results from the inner joins
    const result = await AveAzul.join(
      innerJoin,
      secondInnerJoin,
      thirdPromise,
      (sum, product, value) => ({
        sum,
        product,
        value,
        total: sum + product + value,
      })
    );

    // Verify the expected results
    expect(result).toEqual({
      sum: 6, // 1 + 2 + 3 from the first inner join
      product: 20, // 4 * 5 from the second inner join
      value: 10, // From the third promise
      total: 36, // 6 + 20 + 10 = 36
    });
  });

  test("should handle complex nested joins with 5 promises where 3 are inner joins", async () => {
    // First inner join: Calculate average of three numbers
    const avgJoin = AveAzul.join(
      AveAzul.resolve(10),
      AveAzul.resolve(20),
      AveAzul.resolve(30),
      (a, b, c) => (a + b + c) / 3
    );

    // Second inner join: Concatenate strings
    const strJoin = AveAzul.join(
      AveAzul.resolve("hello"),
      AveAzul.resolve("world"),
      (a, b) => `${a} ${b}`
    );

    // Third inner join: Nested deeper - combine two promises with a calculation
    const nestedJoin = AveAzul.join(
      AveAzul.resolve(5),
      AveAzul.join(AveAzul.resolve(2), AveAzul.resolve(3), (a, b) => a * b),
      (num, product) => num + product
    );

    // Fourth promise: Simple delay with a value
    const delayedPromise = new AveAzul((resolve) =>
      setTimeout(() => resolve(100), 30)
    );

    // Fifth promise: Regular value
    const regularValue = 42;

    // Final join combining all five promises
    const result = await AveAzul.join(
      avgJoin,
      strJoin,
      nestedJoin,
      delayedPromise,
      regularValue,
      (avg, str, nested, delayed, regular) => ({
        average: avg,
        greeting: str,
        nestedResult: nested,
        delayedValue: delayed,
        regularValue: regular,
        summary: `Average: ${avg}, Greeting: ${str}, Nested: ${nested}, Delayed: ${delayed}, Regular: ${regular}`,
      })
    );

    // Verify all the expected results
    expect(result).toEqual({
      average: 20, // (10 + 20 + 30) / 3
      greeting: "hello world", // Concatenated strings
      nestedResult: 11, // 5 + (2 * 3)
      delayedValue: 100, // From the delayed promise
      regularValue: 42, // Regular value
      summary:
        "Average: 20, Greeting: hello world, Nested: 11, Delayed: 100, Regular: 42",
    });
  });

  test("should handle deeply nested join calls with multiple inner joins", async () => {
    // Helper function to create a promise with random delay
    const delayedResolve = (value) => {
      const delay = Math.floor(Math.random() * 21) + 10; // Random delay between 10-30ms
      return new AveAzul((resolve) => setTimeout(() => resolve(value), delay));
    };

    // First inner join with another inner join inside
    const deepNestedJoin1 = AveAzul.join(
      delayedResolve(10),
      // Inner join inside the first inner join
      AveAzul.join(
        delayedResolve(5),
        delayedResolve(15),
        (a, b) => Math.max(a, b) // Get the max value
      ),
      delayedResolve(20),
      (outer1, innerMax, outer2) => ({
        values: [outer1, innerMax, outer2],
        total: outer1 + innerMax + outer2,
      })
    );

    // Second inner join with another inner join inside
    const deepNestedJoin2 = AveAzul.join(
      delayedResolve("first"),
      // Inner join inside the second inner join
      AveAzul.join(
        AveAzul.join(
          // Even deeper nesting (3 levels)
          delayedResolve("nested"),
          delayedResolve("deeply"),
          (a, b) => `${a} ${b}`
        ),
        delayedResolve("value"),
        (deepResult, c) => `${deepResult} ${c}`
      ),
      (prefix, complexString) => `${prefix}: ${complexString}`
    );

    // Third inner join (without further nesting)
    const simpleInnerJoin = AveAzul.join(
      delayedResolve(100),
      delayedResolve(200),
      (a, b) => a * b
    );

    // Fourth promise: Delayed promise with timestamp
    const delayedPromise = new AveAzul((resolve) => {
      const delay = Math.floor(Math.random() * 21) + 10; // Random delay between 10-30ms
      setTimeout(() => resolve({ timestamp: Date.now(), delay }), delay);
    });

    // Fifth promise: Regular value (still needs to be wrapped in promise for consistency)
    const regularValue = delayedResolve({ type: "constant", value: 42 });

    // Record start time to measure total execution
    const startTime = Date.now();

    // Final join combining all five promises with varying depths of nesting
    const result = await AveAzul.join(
      deepNestedJoin1,
      deepNestedJoin2,
      simpleInnerJoin,
      delayedPromise,
      regularValue,
      (firstNested, secondNested, simpleResult, delayed, regular) => {
        const endTime = Date.now();
        return {
          nestedObject: firstNested,
          nestedString: secondNested,
          multiplication: simpleResult,
          delayedData: delayed,
          constant: regular,
          // Create a summary property that combines all results
          combined: {
            numericSum: firstNested.total + simpleResult,
            stringRepresentation: `${secondNested} (total: ${firstNested.total}, product: ${simpleResult})`,
            metaData: {
              hasTimestamp: !!delayed.timestamp,
              constantValue: regular.value,
              totalExecutionTime: endTime - startTime,
            },
          },
        };
      }
    );

    // Verify complex nested structure
    expect(result).toMatchObject({
      nestedObject: {
        values: [10, 15, 20],
        total: 45,
      },
      nestedString: "first: nested deeply value",
      multiplication: 20000,
      delayedData: expect.objectContaining({
        timestamp: expect.any(Number),
      }),
      constant: {
        type: "constant",
        value: 42,
      },
      combined: {
        numericSum: 20045,
        stringRepresentation:
          "first: nested deeply value (total: 45, product: 20000)",
        metaData: {
          hasTimestamp: true,
          constantValue: 42,
          totalExecutionTime: expect.any(Number),
        },
      },
    });

    // The execution should be faster than if we ran all promises sequentially
    // Even with deeply nested joins, the library should handle parallelization
    expect(result.combined.metaData.totalExecutionTime).toBeLessThan(1500);

    // Execution time should be non-zero and reasonable for async operations
    expect(result.combined.metaData.totalExecutionTime).toBeGreaterThan(20);

    // Only log execution time when DEBUG environment variable is set
    if (process.env.DEBUG) {
      console.log(
        `Total execution time: ${result.combined.metaData.totalExecutionTime}ms`
      );
    }
  });
});

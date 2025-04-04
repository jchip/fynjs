"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.fromCallback", () => {
  test("should convert callback-based function to promise (success case)", async () => {
    // Create a callback-based function that simulates successful async operation
    function readFileCallback(callback) {
      setTimeout(() => {
        callback(null, "file contents");
      }, 10);
    }

    const result = await AveAzul.fromCallback(readFileCallback);

    expect(result).toBe("file contents");
  });

  test("should handle errors properly", async () => {
    // Create a callback-based function that simulates failed async operation
    function failingCallback(callback) {
      setTimeout(() => {
        callback(new Error("operation failed"));
      }, 10);
    }

    await expect(AveAzul.fromCallback(failingCallback)).rejects.toThrow(
      "operation failed"
    );
  });

  test("should handle multiple arguments with multiArgs option", async () => {
    // Create a callback-based function that calls back with multiple arguments
    function multiArgCallback(callback) {
      setTimeout(() => {
        callback(null, "result1", "result2", "result3");
      }, 10);
    }

    const results = await AveAzul.fromCallback(multiArgCallback, {
      multiArgs: true,
    });

    expect(results).toEqual(["result1", "result2", "result3"]);
  });

  test("should handle synchronous errors in the callback function", async () => {
    // Create a callback-based function that throws synchronously
    function throwingCallback() {
      throw new Error("sync error");
    }

    await expect(AveAzul.fromCallback(throwingCallback)).rejects.toThrow(
      "sync error"
    );
  });

  test("should handle fromNode alias", async () => {
    // Verify that fromNode is an alias for fromCallback
    function readFileCallback(callback) {
      setTimeout(() => {
        callback(null, "file contents from fromNode");
      }, 10);
    }

    const result = await AveAzul.fromNode(readFileCallback);

    expect(result).toBe("file contents from fromNode");
  });

  test("should handle multiple simultaneous operations", async () => {
    // Simulate multiple database operations
    function dbOperation(id, callback) {
      setTimeout(() => {
        callback(null, { id, data: `Data for ${id}` });
      }, 10 + Math.random() * 20);
    }

    const promises = [1, 2, 3].map((id) =>
      AveAzul.fromCallback((callback) => dbOperation(id, callback))
    );

    const results = await AveAzul.all(promises);

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe(1);
    expect(results[1].id).toBe(2);
    expect(results[2].id).toBe(3);
  });
});

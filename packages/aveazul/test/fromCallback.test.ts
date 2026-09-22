import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("AveAzul.fromCallback", () => {
  test("should convert callback-based function to promise (success case)", () => {
    function readFileCallback(callback) {
      setTimeout(() => {
        callback(null, "file contents");
      }, 10);
    }
    return verify({ timeout: 1000 })
      .step(() => AveAzul.fromCallback(readFileCallback))
      .step((result) => {
        expect(result).toBe("file contents");
      });
  });

  test("should handle errors properly", () => {
    function failingCallback(callback) {
      setTimeout(() => {
        callback(new Error("operation failed"));
      }, 10);
    }
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.fromCallback(failingCallback))
      .step((caught) => {
        expect(() => {
          throw caught;
        }).toThrow("operation failed");
      });
  });

  test("should handle multiple arguments with multiArgs option", () => {
    function multiArgCallback(callback) {
      setTimeout(() => {
        callback(null, "result1", "result2", "result3");
      }, 10);
    }
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.fromCallback(multiArgCallback, {
          multiArgs: true,
        }),
      )
      .step((results) => {
        expect(results).toEqual(["result1", "result2", "result3"]);
      });
  });

  test("should handle synchronous errors in the callback function", () => {
    function throwingCallback() {
      throw new Error("sync error");
    }
    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.fromCallback(throwingCallback))
      .step((caught) => {
        expect(() => {
          throw caught;
        }).toThrow("sync error");
      });
  });

  test("should handle fromNode alias", () => {
    function readFileCallback(callback) {
      setTimeout(() => {
        callback(null, "file contents from fromNode");
      }, 10);
    }
    return verify({ timeout: 1000 })
      .step(() => AveAzul.fromNode(readFileCallback))
      .step((result) => {
        expect(result).toBe("file contents from fromNode");
      });
  });

  test("should handle multiple simultaneous operations", () => {
    function dbOperation(id, callback) {
      setTimeout(
        () => {
          callback(null, { id, data: `Data for ${id}` });
        },
        10 + Math.random() * 20,
      );
    }
    const promises = [1, 2, 3].map((id) =>
      AveAzul.fromCallback<{ id: number; data: string }>((callback) =>
        dbOperation(id, callback),
      ),
    );
    return verify({ timeout: 1000 })
      .step(() => AveAzul.all(promises))
      .step((results) => {
        expect(results).toHaveLength(3);
        expect(results[0].id).toBe(1);
        expect(results[1].id).toBe(2);
        expect(results[2].id).toBe(3);
      });
  });
});

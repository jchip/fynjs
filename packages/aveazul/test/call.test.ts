import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";

describe("AveAzul.prototype.call", () => {
  test("should call a method on the resolved object", () => {
    const testObj = {
      greet(name) {
        return `Hello, ${name}!`;
      },
    };
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(testObj).call("greet", "World"))
      .step((result) => {
        expect(result).toBe("Hello, World!");
      });
  });

  test("should pass multiple arguments to the method", () => {
    const calculator = {
      add(a, b, c) {
        return a + b + c;
      },
    };
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(calculator).call("add", 1, 2, 3))
      .step((result) => {
        expect(result).toBe(6);
      });
  });

  test("should maintain the correct 'this' context", () => {
    const person = {
      name: "Alice",
      getFullName(title) {
        return `${title} ${this.name}`;
      },
    };
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(person).call("getFullName", "Ms."))
      .step((result) => {
        expect(result).toBe("Ms. Alice");
      });
  });

  test("should handle methods that return promises", () => {
    const asyncObj = {
      fetchData(id) {
        return Promise.resolve(`data-${id}`);
      },
    };
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(asyncObj).call("fetchData", "123"))
      .step((result) => {
        expect(result).toBe("data-123");
      });
  });

  test("should reject if the method throws an error", () => {
    const errorObj = {
      problematic() {
        throw new Error("Something went wrong");
      },
    };
    return verify({ timeout: 1000 })
      .expectErrorHas("Something went wrong").step(() =>
        AveAzul.resolve(errorObj).call("problematic")
      );
  });

  test("should reject if the method doesn't exist", () => {
    const obj = {
      existingMethod() {
        return true;
      },
    };
    return verify({ timeout: 1000 })
      .expectErrorInstanceMatch(Error)
      .step(() => AveAzul.resolve(obj).call("nonExistentMethod"));
  });

  test("should work with array methods", () => {
    const array = [3, 1, 4, 1, 5, 9];
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve(array).call("slice", 1, 4))
      .step((result) => {
        expect(result).toEqual([1, 4, 1]);
      })
      .step(() => AveAzul.resolve(array).call("sort"))
      .step((sortedResult) => {
        expect(sortedResult).toEqual([1, 1, 3, 4, 5, 9]);
      });
  });

  test("should work with string methods", () => {
    return verify({ timeout: 1000 })
      .step(() => AveAzul.resolve("hello world").call("toUpperCase"))
      .step((result) => {
        expect(result).toBe("HELLO WORLD");
      })
      .step(() => AveAzul.resolve("hello world").call("substring", 6))
      .step((substringResult) => {
        expect(substringResult).toBe("world");
      });
  });

  test("should handle method chaining", () => {
    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.resolve([1, 2, 3, 4, 5])
          .call("filter", (num) => num % 2 === 0)
          .call("map", (num) => num * 2),
      )
      .step((result) => {
        expect(result).toEqual([4, 8]);
      });
  });
});

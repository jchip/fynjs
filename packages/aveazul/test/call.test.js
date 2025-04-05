"use strict";

const AveAzul = require("./promise-lib");

describe("AveAzul.prototype.call", () => {
  test("should call a method on the resolved object", async () => {
    // Create a test object with methods
    const testObj = {
      greet(name) {
        return `Hello, ${name}!`;
      },
    };

    const result = await AveAzul.resolve(testObj).call("greet", "World");
    expect(result).toBe("Hello, World!");
  });

  test("should pass multiple arguments to the method", async () => {
    const calculator = {
      add(a, b, c) {
        return a + b + c;
      },
    };

    const result = await AveAzul.resolve(calculator).call("add", 1, 2, 3);
    expect(result).toBe(6);
  });

  test("should maintain the correct 'this' context", async () => {
    const person = {
      name: "Alice",
      getFullName(title) {
        return `${title} ${this.name}`;
      },
    };

    const result = await AveAzul.resolve(person).call("getFullName", "Ms.");
    expect(result).toBe("Ms. Alice");
  });

  test("should handle methods that return promises", async () => {
    const asyncObj = {
      fetchData(id) {
        return Promise.resolve(`data-${id}`);
      },
    };

    const result = await AveAzul.resolve(asyncObj).call("fetchData", "123");
    expect(result).toBe("data-123");
  });

  test("should reject if the method throws an error", async () => {
    const errorObj = {
      problematic() {
        throw new Error("Something went wrong");
      },
    };

    await expect(AveAzul.resolve(errorObj).call("problematic")).rejects.toThrow(
      "Something went wrong"
    );
  });

  test("should reject if the method doesn't exist", async () => {
    const obj = {
      existingMethod() {
        return true;
      },
    };

    await expect(
      AveAzul.resolve(obj).call("nonExistentMethod")
    ).rejects.toThrow();
  });

  test("should work with array methods", async () => {
    const array = [3, 1, 4, 1, 5, 9];

    const result = await AveAzul.resolve(array).call("slice", 1, 4);
    expect(result).toEqual([1, 4, 1]);

    const sortedResult = await AveAzul.resolve(array).call("sort");
    expect(sortedResult).toEqual([1, 1, 3, 4, 5, 9]);
  });

  test("should work with string methods", async () => {
    const result = await AveAzul.resolve("hello world").call("toUpperCase");
    expect(result).toBe("HELLO WORLD");

    const substringResult = await AveAzul.resolve("hello world").call(
      "substring",
      6
    );
    expect(substringResult).toBe("world");
  });

  test("should handle method chaining", async () => {
    const result = await AveAzul.resolve([1, 2, 3, 4, 5])
      .call("filter", (num) => num % 2 === 0)
      .call("map", (num) => num * 2);

    expect(result).toEqual([4, 8]);
  });
});

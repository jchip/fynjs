const AveAzul = require("../lib/aveazul");

describe("AveAzul.method", () => {
  test("should convert a synchronous function to a promise-returning function", async () => {
    const add = AveAzul.method((a, b) => a + b);

    const result = await add(1, 2);
    expect(result).toBe(3);
  });

  test("should return AveAzul instances", () => {
    const fn = AveAzul.method(() => 42);

    const promise = fn();
    expect(promise).toBeInstanceOf(AveAzul);
    expect(promise).toBeInstanceOf(Promise);
  });

  test("should preserve 'this' context", async () => {
    const obj = {
      value: 10,
      addMethod: AveAzul.method(function (a) {
        return this.value + a;
      }),
    };

    const result = await obj.addMethod(5);
    expect(result).toBe(15);
  });

  test("should handle thrown exceptions by rejecting the promise", async () => {
    const error = new Error("Test error");
    const throwingFn = AveAzul.method(() => {
      throw error;
    });

    await expect(throwingFn()).rejects.toThrow(error);
  });

  test("should handle returned promises", async () => {
    const asyncFn = AveAzul.method(() => Promise.resolve(42));

    const result = await asyncFn();
    expect(result).toBe(42);
  });

  test("should handle rejected promises", async () => {
    const error = new Error("Async error");
    const asyncFn = AveAzul.method(() => Promise.reject(error));

    await expect(asyncFn()).rejects.toThrow(error);
  });

  test("should handle multiple arguments", async () => {
    const sum = AveAzul.method((...args) => args.reduce((a, b) => a + b, 0));

    const result = await sum(1, 2, 3, 4, 5);
    expect(result).toBe(15);
  });
});

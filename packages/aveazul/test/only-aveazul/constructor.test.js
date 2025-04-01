"use strict";

const AveAzul = require("../../lib/aveazul");

describe("constructor", () => {
  test("should create a new AveAzul instance", () => {
    const promise = new AveAzul((resolve) => resolve(42));
    expect(promise).toBeInstanceOf(AveAzul);
    expect(promise).toBeInstanceOf(Promise);
  });

  test("should handle rejection in constructor", async () => {
    const error = new Error("test");
    const promise = new AveAzul((resolve, reject) => reject(error));
    await expect(promise).rejects.toBe(error);
  });
});

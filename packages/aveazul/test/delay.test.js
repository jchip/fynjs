"use strict";

const AveAzul = require("./promise-lib");

describe("delay", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("delay() should handle single argument using arguments object", async () => {
    const args = [101];
    const start = Date.now();
    await AveAzul.delay.apply(null, args);
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  test("delay() should handle single argument directly", async () => {
    const start = Date.now();
    await AveAzul.delay(101);
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  test("delay() should handle two arguments using arguments object", async () => {
    const args = [101, 42];
    const start = Date.now();
    const result = await AveAzul.delay.apply(null, args);
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(100);
    expect(result).toBe(42);
  });

  test("delay() should resolve after specified time", async () => {
    const start = Date.now();
    await AveAzul.delay(101);
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  test("delay() should resolve with optional value", async () => {
    const result = await AveAzul.delay(50, 42);
    expect(result).toBe(42);
  });
});

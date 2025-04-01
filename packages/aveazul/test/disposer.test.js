"use strict";

const { Disposer } = require("../lib/disposer");
const AveAzul = require("./promise-lib");

describe("Disposer", () => {
  test("should be exported as a class", () => {
    expect(typeof Disposer).toBe("function");
  });

  test("should throw if disposer function is not a function", () => {
    expect(() => {
      AveAzul.resolve({}).disposer("not a function");
    }).toThrow(TypeError);

    expect(() => {
      AveAzul.resolve({}).disposer(null);
    }).toThrow(TypeError);

    expect(() => {
      AveAzul.resolve({}).disposer(undefined);
    }).toThrow(TypeError);

    expect(() => {
      AveAzul.resolve({}).disposer(123);
    }).toThrow(TypeError);
  });

  test("should store promise and cleanup function", () => {
    const resource = { value: "test" };
    const promise = AveAzul.resolve(resource);
    const cleanupFn = () => {};

    const disposer = promise.disposer(cleanupFn);

    // Testing internal structure
    expect(disposer._promise).toBe(promise);
    expect(disposer._data).toBe(cleanupFn);
  });
});

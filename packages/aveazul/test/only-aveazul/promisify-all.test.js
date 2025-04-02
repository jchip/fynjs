"use strict";

const AveAzul = require("../../lib/aveazul");

describe("AveAzul.promisifyAll", () => {
  test("should not promisify constructor functions", () => {
    class MyClass {
      constructor() {}
      method(cb) {
        cb(null, "result");
      }
    }
    MyClass.prototype.someMethod = function () {};

    const obj = {
      MyClass,
      SomeBlah: "hello",
      method(cb) {
        cb(null, "result");
      },
    };

    AveAzul.promisifyAll(obj);
    expect(obj.MyClassAsync).toBeUndefined();
    expect(obj.methodAsync).toBeDefined();
  });

  test("should handle a class that extends an excluded class", () => {
    // Create a class that extends Array
    class CustomArray extends Array {
      customMethod(cb) {
        cb(null, this.length);
      }
    }

    // Create an object containing this custom class
    const container = {
      ExtendedArray: CustomArray,
      regularMethod(cb) {
        cb(null, "regular");
      },
    };

    // Promisify the container and the custom class
    AveAzul.promisifyAll(container);
    AveAzul.promisifyAll(CustomArray.prototype);

    // Check that the custom method was promisified
    const instance = new CustomArray();
    expect(typeof instance.customMethodAsync).toBe("function");

    // The container's regular method should be promisified
    expect(typeof container.regularMethodAsync).toBe("function");

    // The container's ExtendedArray should not have been promisified itself
    expect(container.ExtendedArrayAsync).toBeUndefined();
  });
});

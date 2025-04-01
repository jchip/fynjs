const util = require("../lib/util");

describe("util.isClass", () => {
  test("should correctly identify a class", () => {
    class TestClass {
      constructor() {}
      method() {}
    }
    expect(util.isClass(TestClass)).toBe(true);
  });

  test("should identify as not a class if exception is thrown", () => {
    function simpleFunction() {
      return "not a class";
    }
    simpleFunction.toString = () => {
      throw new Error("oops");
    };
    expect(util.isClass(simpleFunction)).toBe(false);
  });

  test("should handle non-function values", () => {
    expect(util.isClass(null)).toBe(false);
    expect(util.isClass(undefined)).toBe(false);
    expect(util.isClass(42)).toBe(false);
    expect(util.isClass({})).toBe(false);
    expect(util.isClass([])).toBe(false);
  });
});

describe("util.isIdentifier", () => {
  test("should identify valid JavaScript identifiers", () => {
    expect(util.isIdentifier("validName")).toBe(true);
    expect(util.isIdentifier("_privateVar")).toBe(true);
    expect(util.isIdentifier("$specialVar")).toBe(true);
    expect(util.isIdentifier("a1b2c3")).toBe(true);
  });

  test("should reject invalid JavaScript identifiers", () => {
    expect(util.isIdentifier("1invalidStart")).toBe(false);
    expect(util.isIdentifier("invalid-name")).toBe(false);
    expect(util.isIdentifier("invalid.name")).toBe(false);
    expect(util.isIdentifier("")).toBe(false);
  });
});

describe("util.isConstructor", () => {
  test("should identify functions with proper prototype as constructors", () => {
    function Constructor() {}
    Constructor.prototype.constructor = Constructor;
    expect(util.isConstructor(Constructor)).toBe(true);
  });

  test("should reject functions without proper prototype structure", () => {
    function NotAConstructor() {}
    // This has a prototype, but no proper constructor name
    NotAConstructor.prototype = { method: () => {} };
    expect(util.isConstructor(NotAConstructor)).toBe(false);
  });

  test("should handle non-function values and specifically cover line 30", () => {
    // This tests the line 30 return false case
    expect(util.isConstructor(null)).toBe(false);
    expect(util.isConstructor(undefined)).toBe(false);
    expect(util.isConstructor(42)).toBe(false);
    expect(util.isConstructor({})).toBe(false);
    expect(util.isConstructor([])).toBe(false);
  });

  test("should reject functions with improper prototype", () => {
    function FunctionWithImproperPrototype() {}
    // No constructor on prototype
    FunctionWithImproperPrototype.prototype = {};
    expect(util.isConstructor(FunctionWithImproperPrototype)).toBe(false);

    // With constructor but name mismatch
    function AnotherFunction() {}
    AnotherFunction.prototype.constructor = { name: "DifferentName" };
    expect(util.isConstructor(AnotherFunction)).toBe(false);
  });
});

describe("util.isPromisified", () => {
  test("should detect promisified functions", () => {
    const fn = function () {};
    // Mark the function as promisified
    Object.defineProperty(fn, "__isPromisified__", {
      value: true,
      writable: false,
      enumerable: false,
    });
    expect(util.isPromisified(fn)).toBe(true);
  });

  test("should handle non-promisified functions", () => {
    const fn = function () {};
    expect(util.isPromisified(fn)).toBe(false);
  });

  test("should handle errors during property access", () => {
    // Create an object that throws when accessing properties
    const troublemaker = new Proxy(
      {},
      {
        get: () => {
          throw new Error("Cannot access properties");
        },
      }
    );
    expect(util.isPromisified(troublemaker)).toBe(false);
  });
});

describe("util.copyOwnProperties", () => {
  test("should copy properties respecting the filter", () => {
    const source = {
      validProp: "value",
      name: "name property",
      arity: 3,
      prototype: {},
    };
    const target = {};

    util.copyOwnProperties(source, target);

    // Should copy valid properties
    expect(target.validProp).toBe("value");

    // Should not copy filtered properties
    expect(target.name).toBeUndefined();
    expect(target.arity).toBeUndefined();
    expect(target.prototype).toBeUndefined();
  });

  test("should respect custom filters", () => {
    const source = {
      a: 1,
      b: 2,
      c: 3,
    };
    const target = {};

    // Custom filter that only allows 'a' and 'c'
    const customFilter = (prop) => ["a", "c"].includes(prop);

    util.copyOwnProperties(source, target, customFilter);

    expect(target.a).toBe(1);
    expect(target.b).toBeUndefined();
    expect(target.c).toBe(3);
  });
});

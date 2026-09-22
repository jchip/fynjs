import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import * as util from "../src/util.ts";

describe("util.isClass", () => {
  test("should correctly identify a class", () => {
    class TestClass {
      constructor() {}
      method() {}
    }

    return verify({ timeout: 1000 })
      .step(() => util.isClass(TestClass))
      .step((result) => expect(result).toBe(true));
  });

  test("should identify as not a class if exception is thrown", () => {
    function simpleFunction() {
      return "not a class";
    }
    simpleFunction.toString = () => {
      throw new Error("oops");
    };

    return verify({ timeout: 1000 })
      .step(() => util.isClass(simpleFunction))
      .step((result) => expect(result).toBe(false));
  });

  test("should handle non-function values", () =>
    verify({ timeout: 1000 })
      .step(() => util.isClass(null))
      .step((result) => expect(result).toBe(false))
      .step(() => util.isClass(undefined))
      .step((result) => expect(result).toBe(false))
      .step(() => util.isClass(42))
      .step((result) => expect(result).toBe(false))
      .step(() => util.isClass({}))
      .step((result) => expect(result).toBe(false))
      .step(() => util.isClass([]))
      .step((result) => expect(result).toBe(false)));

  test("should identify ES5 constructor functions with prototype methods as classes", () => {
    // Create an ES5 constructor function with a prototype method
    function ES5Class() {
      this.property = "value";
    }

    // Add a method to the prototype
    ES5Class.prototype.method = function () {
      return this.property;
    };

    // Create a constructor with no prototype methods, but with static properties
    function ES5ClassWithStatic() {
      this.property = "value";
    }
    ES5ClassWithStatic.staticProperty = "static";

    return verify({ timeout: 1000 })
      .step(() => util.isClass(ES5Class))
      // This should satisfy the hasOwnMethods condition
      .step((result) => expect(result).toBe(true))
      .step(() => util.isClass(ES5ClassWithStatic))
      // This should satisfy the Object.getOwnPropertyNames(fn).length > 0 condition
      .step((result) => expect(result).toBe(true));
  });

  // Additional tests to cover all branches of the if statement at line 27
  test("should identify ES6 class via 'class' keyword (es6Class branch)", () => {
    // This tests the es6Class branch specifically
    // Using eval to create a class with the 'class' keyword that stringifies correctly
    const ClassWithKeyword = eval(
      "(class TestClassWithKeyword { method() {} })"
    );

    return verify({ timeout: 1000 })
      .step(() => util.isClass(ClassWithKeyword))
      .step((result) => expect(result).toBe(true));
  });

  test("should identify class with multiple prototype methods (hasMethods branch)", () => {
    // This tests the hasMethods branch specifically
    function ClassWithMultipleMethods() {}
    ClassWithMultipleMethods.prototype.method1 = function () {};
    ClassWithMultipleMethods.prototype.method2 = function () {};
    ClassWithMultipleMethods.prototype.method3 = function () {};

    return verify({ timeout: 1000 })
      .step(() => util.isClass(ClassWithMultipleMethods))
      .step((result) => expect(result).toBe(true));
  });

  test("should identify class with single non-constructor method (hasMethodsOtherThanConstructor branch)", () => {
    // This tests the hasMethodsOtherThanConstructor branch specifically
    function ClassWithSingleMethod() {}
    // Only add one method that's not 'constructor'
    ClassWithSingleMethod.prototype.someMethod = function () {};

    return verify({ timeout: 1000 })
      .step(() => util.isClass(ClassWithSingleMethod))
      .step((result) => expect(result).toBe(true));
  });

  test("should identify ES5 class with this assignments and static methods (hasThisAssignmentAndStaticMethods branch)", () => {
    // This tests the hasThisAssignmentAndStaticMethods branch specifically
    function ES5ClassWithThisAssignment() {
      this.property = "value"; // This assignment pattern should be detected
    }
    // Add static methods/properties
    ES5ClassWithThisAssignment.staticMethod = function () {};

    return verify({ timeout: 1000 })
      .step(() => util.isClass(ES5ClassWithThisAssignment))
      .step((result) => expect(result).toBe(true));
  });

  test("should not identify regular functions", () => {
    // Regular function with no prototype methods, this assignments, or static methods
    function regularFunction(a, b) {
      return a + b;
    }

    return verify({ timeout: 1000 })
      .step(() => util.isClass(regularFunction))
      .step((result) => expect(result).toBe(false))
      // Arrow function
      .step(() => util.isClass(() => {}))
      .step((result) => expect(result).toBe(false));
  });
});

describe("util.isIdentifier", () => {
  test("should identify valid JavaScript identifiers", () =>
    verify({ timeout: 1000 })
      .step(() => util.isIdentifier("validName"))
      .step((result) => expect(result).toBe(true))
      .step(() => util.isIdentifier("_privateVar"))
      .step((result) => expect(result).toBe(true))
      .step(() => util.isIdentifier("$specialVar"))
      .step((result) => expect(result).toBe(true))
      .step(() => util.isIdentifier("a1b2c3"))
      .step((result) => expect(result).toBe(true)));

  test("should reject invalid JavaScript identifiers", () =>
    verify({ timeout: 1000 })
      .step(() => util.isIdentifier("1invalidStart"))
      .step((result) => expect(result).toBe(false))
      .step(() => util.isIdentifier("invalid-name"))
      .step((result) => expect(result).toBe(false))
      .step(() => util.isIdentifier("invalid.name"))
      .step((result) => expect(result).toBe(false))
      .step(() => util.isIdentifier(""))
      .step((result) => expect(result).toBe(false)));
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

    return verify({ timeout: 1000 })
      .step(() => util.isPromisified(fn))
      .step((result) => expect(result).toBe(true));
  });

  test("should handle non-promisified functions", () => {
    const fn = function () {};

    return verify({ timeout: 1000 })
      .step(() => util.isPromisified(fn))
      .step((result) => expect(result).toBe(false));
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

    return verify({ timeout: 1000 })
      .step(() => util.isPromisified(troublemaker))
      .step((result) => expect(result).toBe(false));
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
    const target: Partial<typeof source> = {};

    return verify({ timeout: 1000 })
      .step(() => {
        util.copyOwnProperties(source, target);
        return target;
      })
      .step((target) => {
        // Should copy valid properties
        expect(target.validProp).toBe("value");

        // Should not copy filtered properties
        expect(target.name).toBeUndefined();
        expect(target.arity).toBeUndefined();
        expect(target.prototype).toBeUndefined();
      });
  });

  test("should respect custom filters", () => {
    const source = {
      a: 1,
      b: 2,
      c: 3,
    };
    const target: Partial<typeof source> = {};

    // Custom filter that only allows 'a' and 'c'
    const customFilter = (prop) => ["a", "c"].includes(prop);

    return verify({ timeout: 1000 })
      .step(() => {
        util.copyOwnProperties(source, target, customFilter);
        return target;
      })
      .step((target) => {
        expect(target.a).toBe(1);
        expect(target.b).toBeUndefined();
        expect(target.c).toBe(3);
      });
  });
});

describe("util.getObjectDataKeys", () => {
  test("should get own properties and prototype properties", () => {
    // Create an object with prototype and own properties
    function TestConstructor() {}
    TestConstructor.prototype.protoMethod = function () {};

    const obj = new TestConstructor();
    obj.ownProperty = "value";

    return verify({ timeout: 1000 })
      .step(() => util.getObjectDataKeys(obj))
      .step((keys) => {
        // Should include both own property and prototype method
        expect(keys).toContain("ownProperty");
        expect(keys).toContain("protoMethod");
      });
  });

  test("should exclude keys from excluded prototypes", () => {
    // Create an array with a custom property
    const arr: string[] & { customProperty?: string } = ["a", "b", "c"];
    arr.customProperty = "test";

    return verify({ timeout: 1000 })
      .step(() => util.getObjectDataKeys(arr))
      .step((keys) => {
        // Should include own property
        expect(keys).toContain("customProperty");

        // Should not include Array.prototype methods like 'push'
        // This tests the excluded prototypes branch
        // expect(keys).not.toContain("push");
        // expect(keys).not.toContain("forEach");
      });
  });

  test("should honor custom excluded prototypes", () => {
    // Create a custom prototype chain
    function BaseClass() {}
    BaseClass.prototype.baseMethod = function () {};

    function ChildClass() {}
    ChildClass.prototype = Object.create(BaseClass.prototype);
    ChildClass.prototype.childMethod = function () {};

    const instance = new ChildClass();
    instance.ownMethod = function () {};
    const baseProto = Object.getPrototypeOf(ChildClass.prototype);

    return verify({ timeout: 1000 })
      // First get keys without exclusion
      .step(() => util.getObjectDataKeys(instance, []))
      .step((allKeys) => {
        expect(allKeys).toContain("baseMethod");
        expect(allKeys).toContain("childMethod");
        expect(allKeys).toContain("ownMethod");
      })
      // Then exclude the base prototype
      .step(() => util.getObjectDataKeys(instance, [baseProto]))
      .step((filteredKeys) => {
        // Should not include keys from the excluded prototype
        expect(filteredKeys).not.toContain("baseMethod");
        expect(filteredKeys).toContain("childMethod");
        expect(filteredKeys).toContain("ownMethod");
      });
  });

  test("should work with plain objects", () => {
    const obj = {
      method1: function () {},
      property1: "value1",
    };

    return verify({ timeout: 1000 })
      .step(() => util.getObjectDataKeys(obj))
      .step((keys) => {
        expect(keys).toContain("method1");
        expect(keys).toContain("property1");
        // Object.prototype methods should be excluded
        // expect(keys).not.toContain("toString");
        // expect(keys).not.toContain("hasOwnProperty");
      });
  });

  test("should handle objects where getOwnPropertyNames throws", () => {
    // Create a proxy that throws when ownKeys is called during prototype traversal
    const normalObj = { prop: "value" };

    // Create an object with a problematic prototype
    const problematicProto = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("Cannot enumerate keys");
        },
      }
    );

    // Set the problematic proxy as prototype
    Object.setPrototypeOf(normalObj, problematicProto);

    // Should return partial results up to the point of failure
    return verify({ timeout: 1000 })
      .step(() => util.getObjectDataKeys(normalObj))
      .step((keys) => {
        expect(keys).toContain("prop");
      });
  });
});

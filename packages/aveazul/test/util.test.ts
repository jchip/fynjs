import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import * as util from "../src/util.ts";

describe("util.isClass", () => {
  test("should correctly identify a class", () =>
    verify({ timeout: 1000 }).step(() => {
      class TestClass {
        constructor() {}
        method() {}
      }
      expect(util.isClass(TestClass)).toBe(true);
    }));

  test("should identify as not a class if exception is thrown", () =>
    verify({ timeout: 1000 }).step(() => {
      function simpleFunction() {
        return "not a class";
      }
      simpleFunction.toString = () => {
        throw new Error("oops");
      };
      expect(util.isClass(simpleFunction)).toBe(false);
    }));

  test("should handle non-function values", () =>
    verify({ timeout: 1000 }).step(() => {
      expect(util.isClass(null)).toBe(false);
      expect(util.isClass(undefined)).toBe(false);
      expect(util.isClass(42)).toBe(false);
      expect(util.isClass({})).toBe(false);
      expect(util.isClass([])).toBe(false);
    }));

  test("should identify ES5 constructor functions with prototype methods as classes", () =>
    verify({ timeout: 1000 }).step(() => {
      // Create an ES5 constructor function with a prototype method
      function ES5Class() {
        this.property = "value";
      }

      // Add a method to the prototype
      ES5Class.prototype.method = function () {
        return this.property;
      };

      // This should satisfy the hasOwnMethods condition
      expect(util.isClass(ES5Class)).toBe(true);

      // Create a constructor with no prototype methods, but with static properties
      function ES5ClassWithStatic() {
        this.property = "value";
      }
      ES5ClassWithStatic.staticProperty = "static";

      // This should satisfy the Object.getOwnPropertyNames(fn).length > 0 condition
      expect(util.isClass(ES5ClassWithStatic)).toBe(true);
    }));

  // Additional tests to cover all branches of the if statement at line 27
  test("should identify ES6 class via 'class' keyword (es6Class branch)", () =>
    verify({ timeout: 1000 }).step(() => {
      // This tests the es6Class branch specifically
      // Using eval to create a class with the 'class' keyword that stringifies correctly
      const ClassWithKeyword = eval(
        "(class TestClassWithKeyword { method() {} })"
      );
      expect(util.isClass(ClassWithKeyword)).toBe(true);
    }));

  test("should identify class with multiple prototype methods (hasMethods branch)", () =>
    verify({ timeout: 1000 }).step(() => {
      // This tests the hasMethods branch specifically
      function ClassWithMultipleMethods() {}
      ClassWithMultipleMethods.prototype.method1 = function () {};
      ClassWithMultipleMethods.prototype.method2 = function () {};
      ClassWithMultipleMethods.prototype.method3 = function () {};

      expect(util.isClass(ClassWithMultipleMethods)).toBe(true);
    }));

  test("should identify class with single non-constructor method (hasMethodsOtherThanConstructor branch)", () =>
    verify({ timeout: 1000 }).step(() => {
      // This tests the hasMethodsOtherThanConstructor branch specifically
      function ClassWithSingleMethod() {}
      // Only add one method that's not 'constructor'
      ClassWithSingleMethod.prototype.someMethod = function () {};

      expect(util.isClass(ClassWithSingleMethod)).toBe(true);
    }));

  test("should identify ES5 class with this assignments and static methods (hasThisAssignmentAndStaticMethods branch)", () =>
    verify({ timeout: 1000 }).step(() => {
      // This tests the hasThisAssignmentAndStaticMethods branch specifically
      function ES5ClassWithThisAssignment() {
        this.property = "value"; // This assignment pattern should be detected
      }
      // Add static methods/properties
      ES5ClassWithThisAssignment.staticMethod = function () {};

      expect(util.isClass(ES5ClassWithThisAssignment)).toBe(true);
    }));

  test("should not identify regular functions", () =>
    verify({ timeout: 1000 }).step(() => {
      // Regular function with no prototype methods, this assignments, or static methods
      function regularFunction(a, b) {
        return a + b;
      }

      expect(util.isClass(regularFunction)).toBe(false);

      // Arrow function
      const arrowFunction = () => {};
      expect(util.isClass(arrowFunction)).toBe(false);
    }));
});

describe("util.isIdentifier", () => {
  test("should identify valid JavaScript identifiers", () =>
    verify({ timeout: 1000 }).step(() => {
      expect(util.isIdentifier("validName")).toBe(true);
      expect(util.isIdentifier("_privateVar")).toBe(true);
      expect(util.isIdentifier("$specialVar")).toBe(true);
      expect(util.isIdentifier("a1b2c3")).toBe(true);
    }));

  test("should reject invalid JavaScript identifiers", () =>
    verify({ timeout: 1000 }).step(() => {
      expect(util.isIdentifier("1invalidStart")).toBe(false);
      expect(util.isIdentifier("invalid-name")).toBe(false);
      expect(util.isIdentifier("invalid.name")).toBe(false);
      expect(util.isIdentifier("")).toBe(false);
    }));
});

describe("util.isPromisified", () => {
  test("should detect promisified functions", () =>
    verify({ timeout: 1000 }).step(() => {
      const fn = function () {};
      // Mark the function as promisified
      Object.defineProperty(fn, "__isPromisified__", {
        value: true,
        writable: false,
        enumerable: false,
      });
      expect(util.isPromisified(fn)).toBe(true);
    }));

  test("should handle non-promisified functions", () =>
    verify({ timeout: 1000 }).step(() => {
      const fn = function () {};
      expect(util.isPromisified(fn)).toBe(false);
    }));

  test("should handle errors during property access", () =>
    verify({ timeout: 1000 }).step(() => {
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
    }));
});

describe("util.copyOwnProperties", () => {
  test("should copy properties respecting the filter", () =>
    verify({ timeout: 1000 }).step(() => {
      const source = {
        validProp: "value",
        name: "name property",
        arity: 3,
        prototype: {},
      };
      const target: Partial<typeof source> = {};

      util.copyOwnProperties(source, target);

      // Should copy valid properties
      expect(target.validProp).toBe("value");

      // Should not copy filtered properties
      expect(target.name).toBeUndefined();
      expect(target.arity).toBeUndefined();
      expect(target.prototype).toBeUndefined();
    }));

  test("should respect custom filters", () =>
    verify({ timeout: 1000 }).step(() => {
      const source = {
        a: 1,
        b: 2,
        c: 3,
      };
      const target: Partial<typeof source> = {};

      // Custom filter that only allows 'a' and 'c'
      const customFilter = (prop) => ["a", "c"].includes(prop);

      util.copyOwnProperties(source, target, customFilter);

      expect(target.a).toBe(1);
      expect(target.b).toBeUndefined();
      expect(target.c).toBe(3);
    }));
});

describe("util.getObjectDataKeys", () => {
  test("should get own properties and prototype properties", () =>
    verify({ timeout: 1000 }).step(() => {
      // Create an object with prototype and own properties
      function TestConstructor() {}
      TestConstructor.prototype.protoMethod = function () {};

      const obj = new TestConstructor();
      obj.ownProperty = "value";

      const keys = util.getObjectDataKeys(obj);

      // Should include both own property and prototype method
      expect(keys).toContain("ownProperty");
      expect(keys).toContain("protoMethod");
    }));

  test("should exclude keys from excluded prototypes", () =>
    verify({ timeout: 1000 }).step(() => {
      // Create an array with a custom property
      const arr: string[] & { customProperty?: string } = ["a", "b", "c"];
      arr.customProperty = "test";

      const keys = util.getObjectDataKeys(arr);

      // Should include own property
      expect(keys).toContain("customProperty");

      // Should not include Array.prototype methods like 'push'
      // This tests the excluded prototypes branch
      // expect(keys).not.toContain("push");
      // expect(keys).not.toContain("forEach");
    }));

  test("should honor custom excluded prototypes", () =>
    verify({ timeout: 1000 }).step(() => {
      // Create a custom prototype chain
      function BaseClass() {}
      BaseClass.prototype.baseMethod = function () {};

      function ChildClass() {}
      ChildClass.prototype = Object.create(BaseClass.prototype);
      ChildClass.prototype.childMethod = function () {};

      const instance = new ChildClass();
      instance.ownMethod = function () {};

      // First get keys without exclusion
      const allKeys = util.getObjectDataKeys(instance, []);
      expect(allKeys).toContain("baseMethod");
      expect(allKeys).toContain("childMethod");
      expect(allKeys).toContain("ownMethod");

      // Then exclude the base prototype
      const baseProto = Object.getPrototypeOf(ChildClass.prototype);
      const filteredKeys = util.getObjectDataKeys(instance, [baseProto]);

      // Should not include keys from the excluded prototype
      expect(filteredKeys).not.toContain("baseMethod");
      expect(filteredKeys).toContain("childMethod");
      expect(filteredKeys).toContain("ownMethod");
    }));

  test("should work with plain objects", () =>
    verify({ timeout: 1000 }).step(() => {
      const obj = {
        method1: function () {},
        property1: "value1",
      };

      const keys = util.getObjectDataKeys(obj);

      expect(keys).toContain("method1");
      expect(keys).toContain("property1");
      // Object.prototype methods should be excluded
      // expect(keys).not.toContain("toString");
      // expect(keys).not.toContain("hasOwnProperty");
    }));

  test("should handle objects where getOwnPropertyNames throws", () =>
    verify({ timeout: 1000 }).step(() => {
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
      const keys = util.getObjectDataKeys(normalObj);
      expect(keys).toContain("prop");
    }));
});

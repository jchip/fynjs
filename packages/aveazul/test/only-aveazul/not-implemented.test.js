"use strict";

const {
  createInstanceNotImplemented,
  createStaticNotImplemented,
} = require("../../lib/not-implemented");

// Create a mock class to test with - not extending Promise to avoid constructor issues
class MockClass {
  constructor() {
    this.value = "test";
  }
}

describe("not-implemented", () => {
  // Capture console.error output to verify it's called
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("createInstanceNotImplemented", () => {
    test("should add not implemented methods to prototype", () => {
      // Create a fresh MockClass with no methods
      createInstanceNotImplemented(MockClass);

      // Methods should be added
      expect(typeof MockClass.prototype.spread).toBe("function");
      expect(typeof MockClass.prototype.bind).toBe("function");

      // Test that a method throws with the correct error message
      expect(() => {
        const instance = new MockClass();
        instance.spread();
      }).toThrow("instance spread Not implemented in aveazul");

      // Verify console.error was called
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "instance spread Not implemented in aveazul"
      );
    });

    test("should not override existing methods", () => {
      // Create a MockClass with an existing method
      MockClass.prototype.tap = function () {
        return "original tap";
      };
      const originalTap = MockClass.prototype.tap;

      createInstanceNotImplemented(MockClass);

      // Original method should remain untouched
      expect(MockClass.prototype.tap).toBe(originalTap);

      const instance = new MockClass();
      expect(instance.tap()).toBe("original tap");

      // Other methods should be added
      expect(typeof MockClass.prototype.spread).toBe("function");
    });
  });

  describe("createStaticNotImplemented", () => {
    test("should add not implemented static methods to class", () => {
      // Start with clean MockClass
      createStaticNotImplemented(MockClass);

      // Methods should be added
      expect(typeof MockClass.join).toBe("function");
      expect(typeof MockClass.try).toBe("function");
      expect(typeof MockClass.method).toBe("function");

      // Test that a method throws with the correct error message
      expect(() => {
        MockClass.join();
      }).toThrow("static join Not implemented in aveazul");

      // Verify console.error was called
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "static join Not implemented in aveazul"
      );
    });

    test("should not override existing static methods", () => {
      // Create a MockClass with an existing static method
      MockClass.all = function () {
        return "original all";
      };
      const originalAll = MockClass.all;

      createStaticNotImplemented(MockClass);

      // Original method should remain untouched
      expect(MockClass.all).toBe(originalAll);
      expect(MockClass.all()).toBe("original all");

      // Other methods should be added
      expect(typeof MockClass.join).toBe("function");
    });
  });

  test("not implemented methods should log to console and throw", () => {
    createInstanceNotImplemented(MockClass);

    // Create a new instance
    const mockInstance = new MockClass();

    // Method should throw and log
    expect(() => {
      mockInstance.spread("test");
    }).toThrow("instance spread Not implemented in aveazul");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "instance spread Not implemented in aveazul"
    );

    // Static method should also throw and log
    createStaticNotImplemented(MockClass);
    expect(() => {
      MockClass.any([]);
    }).toThrow("static any Not implemented in aveazul");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "static any Not implemented in aveazul"
    );
  });
});

// Tests for all not implemented methods on real AveAzul class
describe("AveAzul not implemented methods", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Spy on console.error to prevent output during tests
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const AveAzul = require("../../lib/aveazul");

  // Test instance methods that should not be implemented
  describe("Instance methods", () => {
    let promise;

    beforeEach(() => {
      // Create a fresh promise instance for each test
      promise = AveAzul.resolve("test");
    });

    // Get the list of not implemented instance methods
    const notImplementedInstanceMethods =
      AveAzul.__notImplementedInstance || [];

    // Dynamically create tests for all not implemented instance methods
    notImplementedInstanceMethods.forEach((methodName) => {
      test(`should throw when calling instance.${methodName}()`, async () => {
        // Verify the method exists on the prototype
        expect(typeof promise[methodName]).toBe("function");

        // Verify calling the method throws the expected error
        expect(() => {
          promise[methodName]();
        }).toThrow(`instance ${methodName} Not implemented in aveazul`);

        // Verify console.error was called with the expected message
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `instance ${methodName} Not implemented in aveazul`
        );
      });
    });
  });

  // Test static methods that should not be implemented
  describe("Static methods", () => {
    // Get the list of not implemented static methods
    const notImplementedStaticMethods = AveAzul.__notImplementedStatic || [];

    // Dynamically create tests for all not implemented static methods
    notImplementedStaticMethods.forEach((methodName) => {
      test(`should throw when calling AveAzul.${methodName}()`, () => {
        // Verify the method exists on AveAzul
        expect(typeof AveAzul[methodName]).toBe("function");

        // Verify calling the method throws the expected error
        expect(() => {
          AveAzul[methodName]();
        }).toThrow(`static ${methodName} Not implemented in aveazul`);

        // Verify console.error was called with the expected message
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `static ${methodName} Not implemented in aveazul`
        );
      });
    });
  });
});

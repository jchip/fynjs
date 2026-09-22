import { verify } from "run-verify";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createInstanceNotImplemented,
  createStaticNotImplemented,
} from "../../src/not-implemented.ts";
import { AveAzul } from "../../src/index.ts";

/** A stub the not-implemented helpers attach their throwing methods to. */
type Stub = (...args: unknown[]) => unknown;

// Create a mock class to test with - not extending Promise to avoid constructor issues.
// The optional members are the ones the helpers under test attach at runtime.
class MockClass {
  value: string;

  // `declare` so these stay type-only: a real field declaration would emit an
  // `undefined` own property that shadows whatever the helpers attach.
  declare spread?: Stub;
  declare bind?: Stub;
  declare tap?: Stub;

  declare static join?: Stub;
  declare static try?: Stub;
  declare static method?: Stub;
  declare static all?: Stub;
  declare static any?: Stub;

  constructor() {
    this.value = "test";
  }
}

describe("not-implemented", () => {
  // Capture console.error output to verify it's called
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("createInstanceNotImplemented", () => {
    test("should add not implemented methods to prototype", () => {
      // Create a fresh MockClass with no methods

      return verify({ timeout: 1000 })
        .step(() => {
          createInstanceNotImplemented(MockClass);
        })
        .step(() => {
          expect(typeof MockClass.prototype.spread).toBe("function");
        })
        .step(() => {
          expect(typeof MockClass.prototype.bind).toBe("function");
        })
        .expectErrorToBe("instance spread Not implemented in aveazul")
        .step(() => {
          const instance = new MockClass();
          instance.spread();
        })
        .step(() => {
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            "instance spread Not implemented in aveazul"
          );
        });
    });

    test("should not override existing methods", () => {
      // Create a MockClass with an existing method
      let originalTap;

      return verify({ timeout: 1000 })
        .step(() => {
          MockClass.prototype.tap = function () {
            return "original tap";
          };
        })
        .step(() => {
          originalTap = MockClass.prototype.tap;
        })
        .step(() => {
          createInstanceNotImplemented(MockClass);
        })
        .step(() => {
          expect(MockClass.prototype.tap).toBe(originalTap);
        })
        .step(() => ({ instance: new MockClass() }))
        .step(({ instance }) => {
          expect(instance.tap()).toBe("original tap");
          expect(typeof MockClass.prototype.spread).toBe("function");
        });
    });
  });

  describe("createStaticNotImplemented", () => {
    test("should add not implemented static methods to class", () => {
      // Start with clean MockClass

      return verify({ timeout: 1000 })
        .step(() => {
          createStaticNotImplemented(MockClass);
        })
        .step(() => {
          expect(typeof MockClass.join).toBe("function");
        })
        .step(() => {
          expect(typeof MockClass.try).toBe("function");
        })
        .step(() => {
          expect(typeof MockClass.method).toBe("function");
        })
        .expectErrorToBe("static join Not implemented in aveazul")
        .step(() => {
          MockClass.join();
        })
        .step(() => {
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            "static join Not implemented in aveazul"
          );
        });
    });

    test("should not override existing static methods", () => {
      // Create a MockClass with an existing static method
      let originalAll;

      return verify({ timeout: 1000 })
        .step(() => {
          MockClass.all = function () {
            return "original all";
          };
        })
        .step(() => {
          originalAll = MockClass.all;
        })
        .step(() => {
          createStaticNotImplemented(MockClass);
        })
        .step(() => {
          expect(MockClass.all).toBe(originalAll);
          expect(MockClass.all()).toBe("original all");
          expect(typeof MockClass.join).toBe("function");
        });
    });
  });

  test("not implemented methods should log to console and throw", () => {
    let mockInstance;

    return verify({ timeout: 1000 })
      .step(() => {
        createInstanceNotImplemented(MockClass);
      })
      .step(() => {
        mockInstance = new MockClass();
      })
      .expectErrorToBe("instance spread Not implemented in aveazul")
      .step(() => mockInstance.spread("test"))
      .step(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "instance spread Not implemented in aveazul"
        );
      })
      .step(() => {
        createStaticNotImplemented(MockClass);
      })
      .expectErrorToBe("static any Not implemented in aveazul")
      .step(() => {
        MockClass.any([]);
      })
      .step(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "static any Not implemented in aveazul"
        );
      });
  });
});

// Tests for all not implemented methods on real AveAzul class
describe("AveAzul not implemented methods", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Spy on console.error to prevent output during tests
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

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
      test(`should throw when calling instance.${methodName}()`, () => {
        // Verify the method exists on the prototype

        return verify({ timeout: 1000 })
          .step(() => {
            expect(typeof promise[methodName]).toBe("function");
          })
          .expectErrorToBe(`instance ${methodName} Not implemented in aveazul`)
          .step(() => {
            promise[methodName]();
          })
          .step(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
              `instance ${methodName} Not implemented in aveazul`
            );
          });
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

        return verify({ timeout: 1000 })
          .step(() => {
            expect(typeof AveAzul[methodName]).toBe("function");
          })
          .expectErrorToBe(`static ${methodName} Not implemented in aveazul`)
          .step(() => {
            AveAzul[methodName]();
          })
          .step(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
              `static ${methodName} Not implemented in aveazul`
            );
          });
      });
    });
  });
});

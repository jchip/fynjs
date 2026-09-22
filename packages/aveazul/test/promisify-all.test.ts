import { verify } from "run-verify";
import { describe, test, expect } from "vitest";
import AveAzul from "./promise-lib.ts";
import fsModule from "node:fs";
import type { Dir, Dirent, Stats } from "node:fs";
import path from "node:path";

/** The shape of the node-style callback the fixtures below hand to promisifyAll. */
type NodeCallback = (err: Error | null, ...values: unknown[]) => void;

/** The members promisifyAll() adds to a copy of `fs`. */
type FsAsync = {
  readFileAsync(file: string, encoding: string): Promise<string>;
  writeFileAsync(file: string, data: string): Promise<void>;
  statAsync(file: string): Promise<Stats>;
  opendirAsync(dir: string): Promise<PromisifiedDir>;
};

/** The members promisifyAll() adds to an `fs.Dir`. */
type PromisifiedDir = Dir &
  Partial<{
    readAsync(): Promise<Dirent | null>;
    closeAsync(): Promise<void>;
  }>;

// Declares the members promisifyAll() would add, all optional, so the test can
// assert that the untouched module object never gained them.
const fs: typeof fsModule & Partial<FsAsync> = fsModule;

describe("AveAzul.promisifyAll", () => {
  test("should promisify all methods of an object", () => {
    // The `Partial<...>` half declares what promisifyAll() adds at runtime; it is
    // optional so the plain literal still assigns, and so the tests below can also
    // assert that a member was *not* added.
    const obj: {
      method1(cb: NodeCallback): void;
      method2(a: number, b: number, cb: NodeCallback): void;
      _privateMethod(cb: NodeCallback): void;
    } & Partial<{
      method1Async(): Promise<string>;
      method2Async(a: number, b: number): Promise<number>;
      _privateMethodAsync(): Promise<string>;
    }> = {
      method1(cb) {
        cb(null, "result1");
      },
      method2(a, b, cb) {
        cb(null, a + b);
      },
      _privateMethod(cb) {
        cb(null, "private");
      },
    };

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj);
      })
      .step(() => obj.method1Async())
      .step((result1) => {
        expect(result1).toBe("result1");
      })
      .step(() => obj.method2Async(1, 2))
      .step((result2) => {
        expect(result2).toBe(3);
        expect(obj._privateMethodAsync).toBeUndefined();
      });
  });

  test("should promisify all methods of a class prototype", () => {
    class MyClass {
      method1(cb: NodeCallback) {
        cb(null, "result1");
      }
      method2(a: number, b: number, cb: NodeCallback) {
        cb(null, a + b);
      }
      _privateMethod(cb: NodeCallback) {
        cb(null, "private");
      }
    }

    const instance: MyClass &
      Partial<{
        method1Async(): Promise<string>;
        method2Async(a: number, b: number): Promise<number>;
        _privateMethodAsync(): Promise<string>;
      }> = new MyClass();
    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(instance);
      })
      .step(() => instance.method1Async())
      .step((result1) => {
        expect(result1).toBe("result1");
      })
      .step(() => instance.method2Async(1, 2))
      .step((result2) => {
        expect(result2).toBe(3);
        expect(instance._privateMethodAsync).toBeUndefined();
      });
  });

  test("should respect custom suffix option", () => {
    const obj: {
      method(cb: NodeCallback): void;
    } & Partial<{
      methodPromise(): Promise<string>;
      methodAsync(): Promise<string>;
    }> = {
      method(cb) {
        cb(null, "result");
      },
    };

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj, { suffix: "Promise" });
      })
      .step(() => obj.methodPromise())
      .step((result) => {
        expect(result).toBe("result");
        expect(obj.methodAsync).toBeUndefined();
      });
  });

  test("should respect custom filter option", () => {
    const obj: {
      method1(cb: NodeCallback): void;
      method2(cb: NodeCallback): void;
    } & Partial<{
      method1Async(): Promise<string>;
      method2Async(): Promise<string>;
    }> = {
      method1(cb) {
        cb(null, "result1");
      },
      method2(cb) {
        cb(null, "result2");
      },
    };

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj, {
          filter: (name) => name === "method1",
        });
      })
      .step(() => obj.method1Async())
      .step((result) => {
        expect(result).toBe("result1");
        expect(obj.method2Async).toBeUndefined();
      });
  });

  test("should handle multiArgs option", () => {
    const obj: {
      method(cb: NodeCallback): void;
    } & Partial<{ methodAsync(): Promise<string[]> }> = {
      method(cb) {
        cb(null, "result1", "result2");
      },
    };

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj, { multiArgs: true });
      })
      .step(() => obj.methodAsync())
      .step(([result1, result2]) => {
        expect(result1).toBe("result1");
        expect(result2).toBe("result2");
      });
  });

  test("should throw on invalid target", () => {
    // expect(() => AveAzul.promisifyAll(null)).toThrow(TypeError);

    return verify({ timeout: 1000 })
      .expectError.step(() => AveAzul.promisifyAll(undefined))
      .step((caught) => {
        expect(caught).toBeInstanceOf(TypeError);
      })
      .expectError.step(() => AveAzul.promisifyAll(42 as unknown as object))
      .step((caught) => {
        expect(caught).toBeInstanceOf(TypeError);
      });
  });

  test("should throw when methods end in Async", () => {
    const obj = {
      method(cb: NodeCallback) {
        cb(null, "result");
      },
      methodAsync(cb: NodeCallback) {
        cb(null, "result");
      },
    };

    return verify({ timeout: 1000 })
      .expectErrorHas(
        "Cannot promisify an API that has normal methods with 'Async'-suffix"
      )
      .step(() => AveAzul.promisifyAll(obj));
  });

  test("should not promisify invalid JavaScript identifiers", () => {
    const obj: {
      "123method"(cb: NodeCallback): void;
      "method-name"(cb: NodeCallback): void;
      "method.name"(cb: NodeCallback): void;
    } & Partial<{
      "123methodAsync"(): Promise<string>;
      "method-nameAsync"(): Promise<string>;
      "method.nameAsync"(): Promise<string>;
    }> = {
      "123method"(cb) {
        cb(null, "result");
      },
      "method-name"(cb) {
        cb(null, "result");
      },
      "method.name"(cb) {
        cb(null, "result");
      },
    };

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj);
      })
      .step(() => {
        expect(obj["123methodAsync"]).toBeUndefined();
        expect(obj["method-nameAsync"]).toBeUndefined();
        expect(obj["method.nameAsync"]).toBeUndefined();
      });
  });

  test("should support custom promisifier", () => {
    const obj: {
      method(a: number, b: number, cb: NodeCallback): void;
    } & Partial<{ methodAsync(a: number, b: number): Promise<number> }> = {
      method(a, b, cb) {
        cb(null, a + b);
      },
    };

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj, {
          promisifier: (fn) => {
            return (...args) => {
              return new AveAzul((resolve) => {
                fn(...args, (err, result) => {
                  // Custom promisifier that ignores errors
                  resolve(result * 2);
                });
              });
            };
          },
        });
      })
      .step(() => obj.methodAsync(2, 3))
      .step((result) => {
        expect(result).toBe(10);
      });
  });

  test("should return AveAzul instances", () => {
    const obj: {
      method(cb: NodeCallback): void;
    } & Partial<{ methodAsync(): Promise<string[]> }> = {
      method(cb) {
        cb(null, "result1", "result2");
      },
    };

    let promise;

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj, { multiArgs: true });
      })
      .step(() => {
        promise = obj.methodAsync();
      })
      .step(() => {
        expect(promise).toBeInstanceOf(AveAzul);
      })
      .step(() => promise)
      .step(([result1, result2]) => {
        expect(result1).toBe("result1");
        expect(result2).toBe("result2");
      });
  });

  test("should handle multiArgs option with error", () => {
    const error = new Error("test error");
    const obj: {
      method(cb: NodeCallback): void;
    } & Partial<{ methodAsync(): Promise<string[]> }> = {
      method(cb) {
        cb(error);
      },
    };

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj, { multiArgs: true });
      })
      .expectError.step(() => obj.methodAsync())
      .step((error) => {
        expect(error).toBeInstanceOf(Error);
      });
  });

  test("should handle multiArgs option with custom promisifier", () => {
    const obj: {
      method(cb: NodeCallback): void;
    } & Partial<{ methodAsync(): Promise<string[]> }> = {
      method(cb) {
        cb(null, "result1", "result2", "result3");
      },
    };

    let promise;

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj, {
          multiArgs: true,
          promisifier: (fn, context, multiArgs) => {
            return (...args) => {
              return new AveAzul((resolve, reject) => {
                args.push((err, ...results) => {
                  if (err) reject(err);
                  else resolve(results.map((r) => r.toUpperCase()));
                });
                fn.apply(context, args);
              });
            };
          },
        });
      })
      .step(() => {
        promise = obj.methodAsync();
      })
      .step(() => {
        expect(promise).toBeInstanceOf(AveAzul);
      })
      .step(() => promise)
      .step((results) => {
        expect(results).toEqual(["RESULT1", "RESULT2", "RESULT3"]);
      });
  });

  test("should throw RangeError when suffix is not a valid identifier", () => {
    const obj = {
      method(cb: NodeCallback) {
        cb(null, "result");
      },
    };

    return verify({ timeout: 1000 })
      .expectError.step(() =>
        AveAzul.promisifyAll(obj, { suffix: "Invalid-Suffix" })
      )
      .step((caught) => {
        expect(caught).toBeInstanceOf(RangeError);
      })
      .expectError.step(() => AveAzul.promisifyAll(obj, { suffix: "123" }))
      .step((caught) => {
        expect(caught).toBeInstanceOf(RangeError);
      })
      .step(() => AveAzul.promisifyAll(obj, { suffix: "$valid" }));
  });

  test("should handle methods in standard prototypes like Array", () => {
    // Try to promisify an array
    const arr: number[] &
      Partial<
        Record<
          "mapAsync" | "filterAsync" | "forEachAsync" | "reduceAsync",
          unknown
        >
      > = [1, 2, 3];
    let objWithArrayProp: {
      myArray: number[];
      arrayMethod(cb: NodeCallback): void;
    } & Partial<{ arrayMethodAsync(): Promise<number[]> }>;

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(arr);
      })
      .step(() => {
        expect(arr.mapAsync).toBeUndefined();
        expect(arr.filterAsync).toBeUndefined();
        expect(arr.forEachAsync).toBeUndefined();
        expect(arr.reduceAsync).toBeUndefined();
      })
      .step(() => {
        objWithArrayProp = {
          myArray: arr,
          arrayMethod(cb) {
            cb(null, this.myArray);
          },
        };
      })
      .step(() => {
        AveAzul.promisifyAll(objWithArrayProp);
      })
      .step(() => {
        expect(objWithArrayProp.arrayMethodAsync).toBeDefined();
        expect(typeof objWithArrayProp.arrayMethodAsync).toBe("function");
        expect(arr.mapAsync).toBeUndefined();
      });
  });

  test("should not promisify methods of a class that extends Array", () => {
    // Create a class that extends Array
    class MyArray extends Array<number> {
      myCustomMethod(cb: NodeCallback) {
        cb(null, this.length);
      }
    }

    // Built via push rather than `new MyArray(1, 2, 3)`: the inherited Array
    // construct signature takes a length, not elements.
    const myArr: MyArray &
      Partial<
        Record<"mapAsync" | "filterAsync" | "myCustomMethodAsync", unknown>
      > = new MyArray();

    return verify({ timeout: 1000 })
      .step(() => {
        myArr.push(1, 2, 3);
      })
      .step(() => {
        AveAzul.promisifyAll(myArr);
      })
      .step(() => {
        expect(myArr.mapAsync).toBeUndefined();
        expect(myArr.filterAsync).toBeUndefined();
        expect(myArr.myCustomMethodAsync).toBeDefined();
      });
  });

  test("should have no effect when called multiple times on the same object", () => {
    const obj: {
      method(cb: NodeCallback): void;
      otherMethod(a: number, cb: NodeCallback): void;
    } & Partial<{
      methodAsync(): Promise<string>;
      otherMethodAsync(a: number): Promise<number>;
    }> = {
      method(cb) {
        cb(null, "result");
      },
      otherMethod(a, cb) {
        cb(null, a + 1);
      },
    };

    // First promisification
    let methodAsync;
    let otherMethodAsync;
    let properties;

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj);
      })
      .step(() => {
        methodAsync = obj.methodAsync;
      })
      .step(() => {
        otherMethodAsync = obj.otherMethodAsync;
      })
      .step(() => {
        properties = Object.getOwnPropertyNames(obj);
      })
      .step(() => {
        AveAzul.promisifyAll(obj);
      })
      .step(() => Object.getOwnPropertyNames(obj))
      .step((newProperties) => {
        expect(newProperties).toEqual(properties);
        expect(obj.methodAsync).toBe(methodAsync);
        expect(obj.otherMethodAsync).toBe(otherMethodAsync);
      })
      .step(() => obj.methodAsync())
      .step((result1) => {
        expect(result1).toBe("result");
      })
      .step(() => obj.otherMethodAsync(5))
      .step((result2) => {
        expect(result2).toBe(6);
      });
  });

  test("should preserve 'this' binding in promisified methods", () => {
    // Object with methods that use 'this'
    const obj: {
      name: string;
      value: number;
      getName(cb: NodeCallback): void;
      getValue(cb: NodeCallback): void;
      setValues(newName: string, newValue: number, cb: NodeCallback): void;
    } & Partial<{
      getNameAsync(): Promise<string>;
      getValueAsync(): Promise<number>;
      setValuesAsync(
        newName: string,
        newValue: number
      ): Promise<{ name: string; value: number }>;
    }> = {
      name: "test-object",
      value: 42,

      getName(cb) {
        cb(null, this.name);
      },

      getValue(cb) {
        cb(null, this.value);
      },

      setValues(newName, newValue, cb) {
        this.name = newName;
        this.value = newValue;
        cb(null, { name: this.name, value: this.value });
      },
    };

    // Promisify all methods

    return verify({ timeout: 1000 })
      .step(() => {
        AveAzul.promisifyAll(obj);
      })
      .step(() => obj.getNameAsync())
      .step((name) => {
        expect(name).toBe("test-object");
      })
      .step(() => obj.getValueAsync())
      .step((value) => {
        expect(value).toBe(42);
      })
      .step(() => obj.setValuesAsync("new-name", 100))
      .step((result) => {
        expect(result).toEqual({ name: "new-name", value: 100 });
        expect(obj.name).toBe("new-name");
        expect(obj.value).toBe(100);
      });
  });

  test("should promisify fs object methods", () => {
    const fsCopy: typeof fsModule & Partial<FsAsync> = { ...fsModule };
    const packageJsonPath = path.join(
      import.meta.dirname,
      "..",
      "package.json"
    );
    const testDir = path.join(import.meta.dirname, "..");
    let dir: PromisifiedDir | undefined;

    return verify({
      timeout: 1000,
      cleanup: async () => {
        if (dir) await dir.close();
      },
    })
      .step(() => AveAzul.promisifyAll(fsCopy))
      .step(() => {
        expect(typeof fsCopy.readFileAsync).toBe("function");
        expect(typeof fsCopy.writeFileAsync).toBe("function");
        expect(typeof fsCopy.statAsync).toBe("function");
        expect(typeof fsCopy.opendirAsync).toBe("function");
      })
      .step(() => ({ promise: fsCopy.readFileAsync(packageJsonPath, "utf8") }))
      .keep.step(({ promise }) => expect(promise).toBeInstanceOf(AveAzul))
      .step(({ promise }) => promise)
      .step((content) => JSON.parse(content))
      .step((packageJson) => {
        expect(packageJson.name).toBe("aveazul");
        expect(packageJson.description).toContain("Bluebird");
      })
      .step(() => fsCopy.statAsync(packageJsonPath))
      .step((stats) => {
        expect(stats.isFile()).toBe(true);
        expect(stats.size).toBeGreaterThan(0);
      })
      .step(() =>
        fsCopy.opendirAsync(testDir).then((opened) => {
          dir = opened;
        })
      )
      .step(() => {
        expect(typeof dir.readAsync).toBe("function");
        expect(typeof dir.closeAsync).toBe("function");
      })
      .step(() => dir.readAsync())
      .step((dirent) => {
        expect(dirent).not.toBeNull();
        expect(typeof dirent.name).toBe("string");
        expect(typeof dirent.isFile()).toBe("boolean");
        expect(typeof dirent.isDirectory()).toBe("boolean");
      })
      .step(() =>
        dir.closeAsync().then(() => {
          dir = undefined;
        })
      )
      .step(() => {
        expect(fs.readFileAsync).toBeUndefined();
        expect(fs.writeFileAsync).toBeUndefined();
        expect(fs.statAsync).toBeUndefined();
        expect(fs.opendirAsync).toBeUndefined();
      });
  });
});

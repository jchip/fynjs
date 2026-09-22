import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { signal, verify } from "run-verify";
import AveAzul from "./promise-lib.ts";
import Bluebird from "bluebird";

describe("AveAzul.using", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("should manage a single resource with cleanup", () => {
    const resource = { value: "test resource", disposed: false };
    let resourceUsed = false;

    // expect the disposer to receive the resource from the promise
    let disposer;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer = AveAzul.resolve(resource).disposer((_res) => {
          _res.disposed = true;
        });
      })
      .step(() =>
        AveAzul.using([disposer], (res) => {
          resourceUsed = true;
          expect(res[0]).toBe(resource);
          expect(res[0].disposed).toBe(false);
          return "success";
        })
      )
      .step((result) => {
        expect(resourceUsed).toBe(true);
        expect(resource.disposed).toBe(true);
        expect(result).toBe("success");
      });
  });

  test("should manage multiple resources using array syntax with cleanup", () => {
    const resources = [
      { id: 1, disposed: false },
      { id: 2, disposed: false },
      { id: 3, disposed: false },
    ];

    const disposers = resources.map((res) =>
      AveAzul.resolve(res).disposer((_res) => {
        _res.disposed = true;
      })
    );

    let resourcesUsed = false;

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.using(disposers, (resArray) => {
          resourcesUsed = true;
          expect(resArray[0]).toBe(resources[0]);
          expect(resArray[1]).toBe(resources[1]);
          expect(resArray[2]).toBe(resources[2]);
          expect(resArray[0].disposed).toBe(false);
          expect(resArray[1].disposed).toBe(false);
          expect(resArray[2].disposed).toBe(false);
          return "success";
        })
      )
      .step((result) => {
        expect(resourcesUsed).toBe(true);
        expect(resources[0].disposed).toBe(true);
        expect(resources[1].disposed).toBe(true);
        expect(resources[2].disposed).toBe(true);
        expect(result).toBe("success");
      });
  });

  function setupCleanupOrderTest() {
    const cleanupOrder: number[] = [];

    const resource1 = { id: 1 };
    const resource2 = { id: 2 };
    const resource3 = { id: 3 };

    const disposer1 = AveAzul.resolve(resource1).disposer(() => {
      return AveAzul.delay(Math.random() * 200).then(() => {
        cleanupOrder.push(1);
      });
    });

    const disposer2 = AveAzul.resolve(resource2).disposer(() => {
      cleanupOrder.push(2);
    });

    const disposer3 = AveAzul.resolve(resource3).disposer(() => {
      return AveAzul.delay(Math.random() * 200).then(() => {
        cleanupOrder.push(3);
      });
    });
    return { cleanupOrder, disposer1, disposer2, disposer3 };
  }

  test("should cleanup resources using array syntax in order of acquisition", () => {
    const { cleanupOrder, disposer1, disposer2, disposer3 } =
      setupCleanupOrderTest();

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.using([disposer1, disposer2, disposer3], () => "success")
      )
      .step(() => {
        expect(cleanupOrder).toEqual([1, 2, 3]);
      });
  });

  test("should cleanup resources using ...args syntax in order of acquisition", () => {
    const { cleanupOrder, disposer1, disposer2, disposer3 } =
      setupCleanupOrderTest();

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.using(disposer1, disposer2, disposer3, () => "success")
      )
      .step(() => {
        expect(cleanupOrder).toEqual([1, 2, 3]);
      });
  });

  test("should clean up resources when handler throws", () => {
    const resource = { disposed: false };
    let disposer;
    let error;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer = AveAzul.resolve(resource).disposer(() => {
          resource.disposed = true;
        });
      })
      .step(() => {
        error = new Error("Test error");
      })
      .expectError.step(() =>
        AveAzul.using(disposer, () => {
          throw error;
        })
      )
      .step((caught) => {
        expect(caught).toBe(error);
      })
      .step(() => {
        expect(resource.disposed).toBe(true);
      });
  });

  test("should clean up resources when handler returns rejected promise", () => {
    const resource = { disposed: false };
    let disposer;
    let error;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer = AveAzul.resolve(resource).disposer(() => {
          resource.disposed = true;
        });
      })
      .step(() => {
        error = new Error("Test error");
      })
      .expectError.step(() =>
        AveAzul.using([disposer], () => {
          return Promise.reject(error);
        })
      )
      .step((caught) => {
        expect(caught).toBe(error);
      })
      .step(() => {
        expect(resource.disposed).toBe(true);
      });
  });

  test("should handle disposer acquisition failure", () => {
    const resource = { disposed: false };
    const acquisitionError = new Error("Resource acquisition failed");

    // Create a disposer that will reject during acquisition
    let failingDisposer;
    let secondResource;

    let result;

    return verify({ timeout: 1000 })
      .step(() => {
        failingDisposer = AveAzul.reject(acquisitionError).disposer(() => {
          resource.disposed = true;
        });
      })
      .step(() => {
        secondResource = { disposed: false };
      })
      .step(() =>
        AveAzul.resolve(secondResource).disposer(() => {
          secondResource.disposed = true;
        })
      )
      .step((secondDisposer) => {
        result = AveAzul.using([failingDisposer, secondDisposer], () => {
          return "success";
        });
      })
      .expectError.step(() => result)
      .step((caught) => {
        expect(caught).toBe(acquisitionError);
      })
      .step(() => {
        expect(resource.disposed).toBe(false);
        expect(secondResource.disposed).toBe(true);
      });
  });

  test("should clean up acquired resources even a later promise resource rejects", () => {
    let disposed = false;
    const resource = { value: "test resource" };

    // Create a disposer that will signal when cleanup happens
    const disposer = AveAzul.resolve(resource).disposer(() => {
      disposed = true;
    });

    const reject1 = () =>
      Promise.reject(new Error("Resource acquisition failed"));
    const reject2 = () =>
      AveAzul.delay(50).then(() =>
        AveAzul.reject(new Error("Resource 2 acquisition failed"))
      );

    // Now create an array with our disposer followed by a rejected promise
    const disposers = [disposer, reject1(), reject2()];

    return verify({ timeout: 500 })
      .expectError.step(() => AveAzul.using(disposers, () => "success"))
      .step((err) => {
        // Now verify that cleanup happened
        expect(disposed).toBe(true);
        expect(err).toBeInstanceOf(Error);
      });
  });

  test("should clean up acquired resources even an earlier promise resource rejects", () => {
    let disposed = false;
    const resource = { value: "test resource" };

    // Create a disposer that will signal when cleanup happens
    const disposer = AveAzul.resolve(resource).disposer(() => {
      disposed = true;
    });

    const reject1 = () =>
      Promise.reject(new Error("Resource acquisition failed"));
    const reject2 = () =>
      AveAzul.delay(50).then(() =>
        AveAzul.reject(new Error("Resource 2 acquisition failed"))
      );

    // Now create an array with our disposer followed by a rejected promise
    const disposers = [reject1(), disposer, reject2()];

    return verify({ timeout: 500 })
      .expectError.step(() => AveAzul.using(disposers, () => "success"))
      .step((err) => {
        // Now verify that cleanup happened
        expect(disposed).toBe(true);
        expect(err).toBeInstanceOf(Error);
      });
  });

  test("should work with non-promise values", () => {
    const disposed = { value: false };

    let disposer;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer = AveAzul.method(() => {
          return {
            value: "test",
            _disposer: () => {
              disposed.value = true;
            },
          };
        })().disposer((resource) => resource._disposer());
      })
      .step(() =>
        AveAzul.using([disposer], (resources) => {
          expect(resources[0].value).toBe("test");
          return "success";
        })
      )
      .step((result) => {
        expect(result).toBe("success");
        expect(disposed.value).toBe(true);
      });
  });

  test("should work with synchronous handlers", () => {
    const resource = { disposed: false };
    let disposer;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer = AveAzul.resolve(resource).disposer(() => {
          resource.disposed = true;
        });
      })
      .step(() =>
        AveAzul.using([disposer], (resources) => {
          return "sync result";
        })
      )
      .step((result) => {
        expect(result).toBe("sync result");
        expect(resource.disposed).toBe(true);
      });
  });

  test("should work with nested using calls", () => {
    const resources = [
      { id: "outer", disposed: false },
      { id: "inner", disposed: false },
    ];

    let outerDisposer;

    return verify({ timeout: 1000 })
      .step(() => {
        outerDisposer = AveAzul.resolve(resources[0]).disposer(() => {
          resources[0].disposed = true;
        });
      })
      .step(() =>
        AveAzul.resolve(resources[1]).disposer(() => {
          resources[1].disposed = true;
        })
      )
      .step((innerDisposer) =>
        AveAzul.using([outerDisposer], async (outerResources) => {
          expect(outerResources[0]).toBe(resources[0]);

          return AveAzul.using([innerDisposer], (innerResources) => {
            expect(innerResources[0]).toBe(resources[1]);
            return "nested success";
          });
        })
      )
      .step((result) => {
        expect(result).toBe("nested success");
        expect(resources[0].disposed).toBe(true);
        expect(resources[1].disposed).toBe(true);
      });
  });

  test("should handle async disposer functions", () => {
    let disposed = false;
    const resource = { value: "test" };
    const cleanup = signal<void>();
    let usingPromise: PromiseLike<unknown>;

    return verify({ timeout: 500, signals: { cleanup } })
      .step(() => {
        const disposer = AveAzul.resolve(resource).disposer(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          disposed = true;
          cleanup.resolve(undefined);
        });

        usingPromise = AveAzul.using([disposer], () => "success");
      })
      .awaiting(cleanup)
      .step(() => usingPromise)
      .step(() => {
        expect(disposed).toBe(true);
      });
  });

  test("should pass the resource to the cleanup function", () => {
    const resource = { value: "test", cleaned: false };

    let disposer;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer = AveAzul.resolve(resource).disposer((res) => {
          expect(res).toBe(resource);
          res.cleaned = true;
        });
      })
      .step(() => AveAzul.using([disposer], () => "success"))
      .step(() => {
        expect(resource.cleaned).toBe(true);
      });
  });

  test("should work with diposer and other types of resources", () => {
    const resource1 = { id: "aveazul", disposed: false };

    // Using AveAzul promise
    let disposer1;
    let promise2;
    let result;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer1 = AveAzul.resolve(resource1).disposer(() => {
          resource1.disposed = true;
        });
      })
      .step(() => {
        promise2 = Promise.resolve("foobar");
      })
      .step(() => {
        result = [];
      })
      .step(() =>
        AveAzul.using("hello world", disposer1, promise2, (a, b, c) => {
          result.push(a, b, c);
          return "success";
        })
      )
      .step((res) => {
        expect(res).toBe("success");
        expect(resource1.disposed).toBe(true);
        expect(result).toEqual(["hello world", resource1, "foobar"]);
      });
  });

  test("should handle a practical example like file operations with mocks", () => {
    // Mock file system operations
    const mockFS = {
      openFile: vi.fn().mockResolvedValue({
        fileHandle: 123,
        path: "/path/to/file.txt",
      }),
      readFile: vi.fn().mockImplementation((file) => {
        return Promise.resolve(`Content of ${file.path}`);
      }),
      closeFile: vi.fn().mockResolvedValue(undefined),
    };

    // Function to create a disposer for file handles
    const getFileDisposer = (path) => {
      return mockFS
        .openFile(path)
        .then((fileHandle) =>
          AveAzul.resolve(fileHandle).disposer(() =>
            mockFS.closeFile(fileHandle)
          )
        );
    };

    // Get the file disposer first to ensure it's resolved before using

    return verify({ timeout: 1000 })
      .step(() => getFileDisposer("/path/to/file.txt"))
      .step((fileDisposer) =>
        AveAzul.using([fileDisposer], async (resources) => {
          // The resource should already be resolved now
          const file = resources[0];
          const content = await mockFS.readFile(file);
          return content;
        })
      )
      .step((result) => {
        expect(result).toBe("Content of /path/to/file.txt");
        expect(mockFS.openFile).toHaveBeenCalledWith("/path/to/file.txt");
        expect(mockFS.readFile).toHaveBeenCalledWith({
          fileHandle: 123,
          path: "/path/to/file.txt",
        });
        expect(mockFS.closeFile).toHaveBeenCalledWith({
          fileHandle: 123,
          path: "/path/to/file.txt",
        });
      });
  });

  test("should handle error when acquiring from promise-like resource", () => {
    const acquisitionError = new Error(
      "Promise-like resource acquisition failed"
    );

    // Create two resources: one that succeeds and one that fails
    const successResource = { disposed: false };
    let successDisposer;
    let failingPromiseLike;

    return verify({ timeout: 1000 })
      .step(() => {
        successDisposer = AveAzul.resolve(successResource).disposer(() => {
          successResource.disposed = true;
        });
      })
      .step(() => {
        failingPromiseLike = {
          then: function (resolve, reject) {
            reject(acquisitionError);
            return this;
          },
          catch: function (onReject) {
            onReject(acquisitionError);
            return this;
          },
        };
      })
      .expectError.step(() =>
        AveAzul.using([successDisposer, failingPromiseLike], () => "success")
      )
      .step((caught) => {
        expect(caught).toBe(acquisitionError);
      })
      .step(() => {
        expect(successResource.disposed).toBe(true);
      });
  });

  test("should wait for handler to complete before calling dispose functions", () => {
    // Create a sequence tracker to monitor the order of operations
    const sequence = [];

    const resource = { value: "test resource", disposed: false };

    // Create a disposer that records when disposal happens
    let disposer;

    return verify({ timeout: 1000 })
      .step(() => {
        disposer = AveAzul.resolve(resource).disposer(() => {
          sequence.push("dispose called");
          resource.disposed = true;
        });
      })
      .step(() =>
        AveAzul.using([disposer], async () => {
          // Record that we're in the handler
          sequence.push("handler started");

          // Use a delay to simulate async operations in the handler
          await AveAzul.delay(50);

          // Record that the handler is about to complete
          sequence.push("handler finishing");

          return "done";
        })
      )
      .step(() => {
        expect(sequence).toEqual([
          "handler started",
          "handler finishing",
          "dispose called",
        ]);
        expect(resource.disposed).toBe(true);
      });
  });

  test("should handle a promise that resolves to a disposer", () => {
    // A simple resource class for testing
    class Resource {
      name: string;
      disposed: boolean;

      constructor(name: string) {
        this.name = name;
        this.disposed = false;
      }

      dispose() {
        this.disposed = true;
      }

      disposer() {
        return AveAzul.resolve(this).disposer((r) => r.dispose());
      }

      bluebirdDisposer() {
        return Bluebird.resolve(this).disposer((r) => r.dispose());
      }
    }

    // Test how AveAzul handles a promise that resolves to a disposer
    const aveazulResource = new Resource("AveAzul");
    // Create a function that returns a promise resolving to a disposer
    const getAveAzulPromiseToDisposer = () => {
      return AveAzul.resolve(aveazulResource.disposer());
    };

    let bluebirdResource;

    return verify({ timeout: 1000 })
      .step(() =>
        AveAzul.using(getAveAzulPromiseToDisposer(), (resource) => {
          expect(resource.name).toBe("AveAzul");
          expect(resource.disposed).toBe(false);
        })
      )
      .step(() => {
        expect(aveazulResource.disposed).toBe(true);
      })
      .step(() => {
        bluebirdResource = new Resource("Bluebird");
      })
      .step(() => () => {
        return Bluebird.resolve(bluebirdResource.bluebirdDisposer());
      })
      .step((getBluebirdPromiseToDisposer) =>
        Bluebird.using(getBluebirdPromiseToDisposer(), (resource) => {
          expect(resource.name).toBe("Bluebird");
          expect(resource.disposed).toBe(false);
        })
      )
      .step(() => {
        expect(bluebirdResource.disposed).toBe(true);
      });
  });

  test("should compare direct disposer vs promise-to-disposer behavior", () => {
    // A simple resource class for testing
    class Resource {
      name: string;
      disposed: boolean;
      usedIn: string[];

      constructor(name: string) {
        this.name = name;
        this.disposed = false;
        this.usedIn = [];
      }

      use(context: string) {
        this.usedIn.push(context);
      }

      dispose() {
        this.disposed = true;
      }

      disposer() {
        return AveAzul.resolve(this).disposer((r) => r.dispose());
      }

      bluebirdDisposer() {
        return Bluebird.resolve(this).disposer((r) => r.dispose());
      }
    }

    // Test with AveAzul - direct disposer vs promise-to-disposer
    const aveResource1 = new Resource("AveAzul-Direct");
    const aveDirectDisposer = aveResource1.disposer();

    const aveResource2 = new Resource("AveAzul-Promised");

    let bbResource1;
    let bbDirectDisposer;
    let bbResource2;

    return verify({ timeout: 1000 })
      .step(() => ({
        avePromiseToDisposer: AveAzul.resolve(aveResource2.disposer()),
      }))
      .step(({ avePromiseToDisposer }) =>
        AveAzul.using(aveDirectDisposer, avePromiseToDisposer, (r1, r2) => {
          r1.use("direct");
          r2.use("promised");
        })
      )
      .step(() => {
        expect(aveResource1.disposed).toBe(true);
        expect(aveResource2.disposed).toBe(true);
        expect(aveResource1.usedIn).toContain("direct");
        expect(aveResource2.usedIn).toContain("promised");
      })
      .step(() => {
        bbResource1 = new Resource("Bluebird-Direct");
      })
      .step(() => {
        bbDirectDisposer = bbResource1.bluebirdDisposer();
      })
      .step(() => {
        bbResource2 = new Resource("Bluebird-Promised");
      })
      .step(() => ({
        bbPromiseToDisposer: Bluebird.resolve(bbResource2.bluebirdDisposer()),
      }))
      .step(({ bbPromiseToDisposer }) =>
        Bluebird.using(bbDirectDisposer, bbPromiseToDisposer, (r1, r2) => {
          r1.use("direct");
          r2.use("promised");
        })
      )
      .step(() => {
        expect(bbResource1.disposed).toBe(true);
        expect(bbResource2.disposed).toBe(true);
        expect(bbResource1.usedIn).toContain("direct");
        expect(bbResource2.usedIn).toContain("promised");
      });
  });
});

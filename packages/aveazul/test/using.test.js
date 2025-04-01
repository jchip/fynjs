const AveAzul = require("../lib/aveazul");

describe("AveAzul.using", () => {
  test("should manage a single resource with cleanup", async () => {
    const resource = { value: "test resource", disposed: false };
    let resourceUsed = false;

    const disposer = AveAzul.resolve(resource).disposer(() => {
      resource.disposed = true;
    });

    const result = await AveAzul.using([disposer], (res) => {
      resourceUsed = true;
      expect(res[0]).toBe(resource);
      expect(res[0].disposed).toBe(false);
      return "success";
    });

    expect(resourceUsed).toBe(true);
    expect(resource.disposed).toBe(true);
    expect(result).toBe("success");
  });

  test("should manage multiple resources with cleanup", async () => {
    const resources = [
      { id: 1, disposed: false },
      { id: 2, disposed: false },
      { id: 3, disposed: false },
    ];

    const disposers = resources.map((res) =>
      AveAzul.resolve(res).disposer(() => {
        res.disposed = true;
      })
    );

    let resourcesUsed = false;

    const result = await AveAzul.using(disposers, (resArray) => {
      resourcesUsed = true;
      expect(resArray[0]).toBe(resources[0]);
      expect(resArray[1]).toBe(resources[1]);
      expect(resArray[2]).toBe(resources[2]);
      expect(resArray[0].disposed).toBe(false);
      expect(resArray[1].disposed).toBe(false);
      expect(resArray[2].disposed).toBe(false);
      return "success";
    });

    expect(resourcesUsed).toBe(true);
    expect(resources[0].disposed).toBe(true);
    expect(resources[1].disposed).toBe(true);
    expect(resources[2].disposed).toBe(true);
    expect(result).toBe("success");
  });

  test("should manage resources with array syntax", async () => {
    const resources = [
      { id: 1, disposed: false },
      { id: 2, disposed: false },
    ];

    const disposers = resources.map((res) =>
      AveAzul.resolve(res).disposer(() => {
        res.disposed = true;
      })
    );

    const result = await AveAzul.using(disposers, (resArray) => {
      expect(Array.isArray(resArray)).toBe(true);
      expect(resArray[0]).toBe(resources[0]);
      expect(resArray[1]).toBe(resources[1]);
      return "success";
    });

    expect(resources[0].disposed).toBe(true);
    expect(resources[1].disposed).toBe(true);
    expect(result).toBe("success");
  });

  test("should cleanup resources in reverse order", async () => {
    const cleanupOrder = [];

    const resource1 = { id: 1 };
    const resource2 = { id: 2 };
    const resource3 = { id: 3 };

    const disposer1 = AveAzul.resolve(resource1).disposer(() => {
      cleanupOrder.push(1);
    });

    const disposer2 = AveAzul.resolve(resource2).disposer(() => {
      cleanupOrder.push(2);
    });

    const disposer3 = AveAzul.resolve(resource3).disposer(() => {
      cleanupOrder.push(3);
    });

    await AveAzul.using([disposer1, disposer2, disposer3], () => "success");

    // Resources should be cleaned up in reverse order of acquisition
    expect(cleanupOrder).toEqual([3, 2, 1]);
  });

  test("should clean up resources when handler throws", async () => {
    const resource = { disposed: false };
    const disposer = AveAzul.resolve(resource).disposer(() => {
      resource.disposed = true;
    });

    const error = new Error("Test error");

    await expect(
      AveAzul.using([disposer], () => {
        throw error;
      })
    ).rejects.toThrow(error);

    expect(resource.disposed).toBe(true);
  });

  test("should clean up resources when handler returns rejected promise", async () => {
    const resource = { disposed: false };
    const disposer = AveAzul.resolve(resource).disposer(() => {
      resource.disposed = true;
    });

    const error = new Error("Test error");

    await expect(
      AveAzul.using([disposer], () => {
        return Promise.reject(error);
      })
    ).rejects.toThrow(error);

    expect(resource.disposed).toBe(true);
  });

  test.skip("should clean up acquired resources even if later promises reject", async () => {
    let disposed = false;
    const resource = { value: "test resource" };

    // First wrap our cleanup in a promise we can await
    const cleanupPromise = new Promise((resolve) => {
      // Create a disposer that will signal when cleanup happens
      const disposer = AveAzul.resolve(resource).disposer(() => {
        disposed = true;
        resolve();
      });

      // Now create an array with our disposer followed by a rejected promise
      const disposers = [
        disposer,
        Promise.reject(new Error("Resource acquisition failed")),
      ];

      // Catch the error here to prevent test failure
      AveAzul.using(disposers, () => "success").catch(() => {});
    });

    // Wait for the cleanup to happen
    await cleanupPromise;

    // Now verify that cleanup happened
    expect(disposed).toBe(true);
  });

  test("should continue cleanup if a disposer throws", async () => {
    const cleanupCalled = [false, false, false];
    const resources = [{ id: 1 }, { id: 2 }, { id: 3 }];

    const disposer1 = AveAzul.resolve(resources[0]).disposer(() => {
      cleanupCalled[0] = true;
    });

    const disposer2 = AveAzul.resolve(resources[1]).disposer(() => {
      cleanupCalled[1] = true;
      throw new Error("Cleanup error");
    });

    const disposer3 = AveAzul.resolve(resources[2]).disposer(() => {
      cleanupCalled[2] = true;
    });

    // Should not throw even though a disposer throws
    const result = await AveAzul.using(
      [disposer1, disposer2, disposer3],
      () => "success"
    );

    expect(result).toBe("success");
    expect(cleanupCalled).toEqual([true, true, true]);
  });

  test("should work with non-promise values", async () => {
    const disposed = { value: false };

    const disposer = AveAzul.method(() => {
      return {
        value: "test",
        _disposer: () => {
          disposed.value = true;
        },
      };
    })().disposer((resource) => resource._disposer());

    const result = await AveAzul.using([disposer], (resources) => {
      expect(resources[0].value).toBe("test");
      return "success";
    });

    expect(result).toBe("success");
    expect(disposed.value).toBe(true);
  });

  test("should work with synchronous handlers", async () => {
    const resource = { disposed: false };
    const disposer = AveAzul.resolve(resource).disposer(() => {
      resource.disposed = true;
    });

    const result = await AveAzul.using([disposer], (resources) => {
      return "sync result";
    });

    expect(result).toBe("sync result");
    expect(resource.disposed).toBe(true);
  });

  test("should work with nested using calls", async () => {
    const resources = [
      { id: "outer", disposed: false },
      { id: "inner", disposed: false },
    ];

    const outerDisposer = AveAzul.resolve(resources[0]).disposer(() => {
      resources[0].disposed = true;
    });

    const innerDisposer = AveAzul.resolve(resources[1]).disposer(() => {
      resources[1].disposed = true;
    });

    const result = await AveAzul.using(
      [outerDisposer],
      async (outerResources) => {
        expect(outerResources[0]).toBe(resources[0]);

        return AveAzul.using([innerDisposer], (innerResources) => {
          expect(innerResources[0]).toBe(resources[1]);
          return "nested success";
        });
      }
    );

    expect(result).toBe("nested success");
    expect(resources[0].disposed).toBe(true);
    expect(resources[1].disposed).toBe(true);
  });

  test("should handle async disposer functions", async () => {
    let disposed = false;
    const resource = { value: "test" };

    // Use a different approach to ensure the async cleanup completes
    const cleanupPromise = new Promise((resolve) => {
      const disposer = AveAzul.resolve(resource).disposer(async () => {
        await new Promise((r) => setTimeout(r, 10));
        disposed = true;
        resolve(); // Signal that cleanup is done
      });

      AveAzul.using([disposer], () => "success");
    });

    // Wait for cleanup to complete
    await cleanupPromise;
    expect(disposed).toBe(true);
  });

  test("should pass the resource to the cleanup function", async () => {
    const resource = { value: "test", cleaned: false };

    const disposer = AveAzul.resolve(resource).disposer((res) => {
      expect(res).toBe(resource);
      res.cleaned = true;
    });

    await AveAzul.using([disposer], () => "success");

    expect(resource.cleaned).toBe(true);
  });
});

describe("AveAzul.Disposer", () => {
  test("should be exported as a class", () => {
    expect(typeof AveAzul.Disposer).toBe("function");
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

  test("disposer should work with both Promise and AveAzul instances", async () => {
    const resource1 = { id: "aveazul", disposed: false };
    const resource2 = { id: "native", disposed: false };

    // Using AveAzul promise
    const disposer1 = AveAzul.resolve(resource1).disposer(() => {
      resource1.disposed = true;
    });

    // Using native Promise
    const promise2 = Promise.resolve(resource2);
    const disposer2 = promise2.disposer
      ? promise2.disposer(() => {
          resource2.disposed = true;
        })
      : new AveAzul.Disposer(() => {
          resource2.disposed = true;
        }, promise2);

    await AveAzul.using([disposer1, disposer2], () => "success");

    expect(resource1.disposed).toBe(true);
    expect(resource2.disposed).toBe(true);
  });

  test("should handle a practical example like file operations with mocks", async () => {
    // Mock file system operations
    const mockFS = {
      openFile: jest.fn().mockResolvedValue({
        fileHandle: 123,
        path: "/path/to/file.txt",
      }),
      readFile: jest.fn().mockImplementation((file) => {
        return Promise.resolve(`Content of ${file.path}`);
      }),
      closeFile: jest.fn().mockResolvedValue(undefined),
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
    const fileDisposer = await getFileDisposer("/path/to/file.txt");

    const result = await AveAzul.using([fileDisposer], async (resources) => {
      // The resource should already be resolved now
      const file = resources[0];
      const content = await mockFS.readFile(file);
      return content;
    });

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

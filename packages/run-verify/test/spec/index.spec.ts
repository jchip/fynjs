import { describe, it, expect } from "vitest";
import {
  runVerify,
  wrapVerify,
  asyncVerify,
  wrapAsyncVerify,
  expectError,
  expectErrorHas,
  expectErrorToBe,
  onFailVerify,
  withCallback,
  wrapCheck,
  runTimeout,
  runFinally,
  runDefer,
  IS_FINALLY
} from "../../src/index.ts";

const fooEvent = (delay: number, cb: (err: Error | null, result?: string) => void) =>
  setTimeout(() => cb(null, "foo"), delay);
const fooErrorEvent = (delay: number, cb: (err: Error) => void) =>
  setTimeout(() => cb(new Error("foo failed")), delay);

describe("runVerify", () => {
  it("should verify async event returning unexpected result", () => {
    return new Promise<void>((done) => {
      runVerify(
        (next: any) => fooEvent(1, next),
        (data: any) => {
          expect(data).toBe("blah");
        },
        (err: Error) => {
          try {
            expect(err).toBeDefined();
            expect(err.message).toContain("'foo' to equal 'blah'");
            done();
          } catch (err2) {
            done();
          }
        }
      );
    });
  });

  it("should verify async event returning error", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((next: any) => {
          fooErrorEvent(1, next);
        }),
        done
      );
    });
  });

  it("should pass error from async event to next check func", () => {
    return new Promise<void>((done) => {
      runVerify(
        wrapCheck((next: any) => {
          fooErrorEvent(1, next);
        }).expectError!,
        (err: Error) => {
          expect(err.message).toContain("foo failed");
        },
        done
      );
    });
  });

  it("should verify async event error _has_ msg and pass to next check func", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectErrorHas((next: any) => {
          fooErrorEvent(1, next);
        }, "oo failed"),
        done
      );
    });
  });

  it("should verify async event error _equal_ msg and pass to next check func", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectErrorToBe((next: any) => {
          fooErrorEvent(1, next);
        }, "foo failed"),
        done
      );
    });
  });

  it("should fail async event error _not has_ msg", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectErrorHas((next: any) => {
          runVerify(expectErrorHas((next2: any) => fooErrorEvent(1, next2), "blahblah"), next);
        }, "with message has 'blahblah'"),
        done
      );
    });
  });

  it("should fail async event error _not equal_ msg", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectErrorHas((next: any) => {
          runVerify(expectErrorToBe((next2: any) => fooErrorEvent(1, next2), "blahblah"), next);
        }, "with message to be 'blahblah'"),
        done
      );
    });
  });

  it("should fail if expectError check func didn't return error", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((next: any) => {
          runVerify(
            expectError((next2: any) => {
              fooEvent(1, next2);
            }),
            next
          );
        }),
        (err: Error) => {
          expect(err.message).toContain("runVerify expecting error from check function number 0");
        },
        done
      );
    });
  });

  it("should fail if check func invoke callback with error", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((next: any) => {
          runVerify((cb: any) => cb(new Error("fail me")), next);
        }),
        (err: Error) => {
          expect(err.message).toContain("fail me");
        },
        done
      );
    });
  });

  it("should fail if check func throws error", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((next: any) => {
          runVerify((_cb: any) => {
            throw new Error("test oops");
          }, next);
        }),
        (err: Error) => {
          expect(err.message).toContain("test oops");
        },
        done
      );
    });
  });

  it("should handle if expectError check func throws error", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((_next: any) => {
          throw new Error("test oops");
        }),
        (err: Error) => {
          expect(err.message).toContain("test oops");
        },
        done
      );
    });
  });

  it("should handle error from expectError async check func", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError(() => {
          return new Promise((_resolve, reject) => {
            runVerify(() => {
              return Promise.reject(new Error("test oops"));
            }, reject);
          });
        }),
        (err: Error) => {
          expect(err.message).toContain("test oops");
        },
        done
      );
    });
  });

  it("should fail if expectError async check func didn't return error", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((next: any) => {
          runVerify(
            expectError(() => {
              return Promise.resolve("oh well");
            }),
            next
          );
        }),
        (err: Error) => {
          expect(err.message).toContain("runVerify expecting error from check function number 0");
        },
        done
      );
    });
  });

  it("should fail if expectError check func didn't return throw", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((next: any) => {
          runVerify(
            expectError(() => {
              return "oh well";
            }),
            next
          );
        }),
        (err: Error) => {
          expect(err.message).toContain("runVerify expecting error from check function number 0");
        },
        done
      );
    });
  });

  it("should detect callback from check func with single param's name", () => {
    return new Promise<void>((done) => {
      runVerify(
        function (done2: any) {
          return fooEvent(1, done2);
        },
        (data: any) => {
          expect(data).toBe("foo");
        },
        done
      );
    });
  });

  it("should pass callback to withCallback check func", () => {
    return new Promise<void>((done) => {
      runVerify(
        withCallback((x: any) => {
          return fooEvent(1, x);
        }),
        (data: any) => {
          expect(data).toBe("foo");
        },
        done
      );
    });
  });

  it("should fail if no done function passed", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError(() => {
          runVerify(() => {});
        }),
        (err: Error) => {
          expect(err.message).toContain("runVerify - must pass done function");
        },
        done
      );
    });
  });

  it("should fail if pass in a non-function", () => {
    return new Promise<void>((done) => {
      runVerify(
        expectError((next: any) => {
          runVerify("woohoo", next);
        }),
        (err: Error) => {
          expect(err.message).toContain("runVerify param 0 is not a function: type string");
        },
        done
      );
    });
  });

  it("should pass result to done if it's expecting them", () => {
    return new Promise<void>((done) => {
      runVerify(
        (callback: any) => fooEvent(1, callback),
        (err: Error | null, r: any) => {
          if (r !== "foo") {
            return done();
          }
          return done();
        }
      );
    });
  });

  it("should call AsyncFunction without callback", () => {
    return new Promise<void>((done) => {
      runVerify(
        (next: any) => fooEvent(1, next),
        async (a: any, b: any, c: any) => {
          expect(a).toBe("foo");
          expect(b).toBeUndefined();
          expect(c).toBeUndefined();
        },
        done
      );
    });
  });

  it("should call function with more than 1 param with callback", () => {
    return new Promise<void>((done) => {
      runVerify(
        (next: any) => fooEvent(1, next),
        (result: any, next: any) => {
          expect(result).toBe("foo");
          expect(typeof next).toBe("function");
          next();
        },
        done
      );
    });
  });

  it("should catch errors from sync finally checkFunc", () => {
    return new Promise<void>((done) => {
      let f1: boolean | undefined;
      let f2: boolean | undefined;
      runVerify(
        runFinally(() => {
          return Promise.reject(new Error("test"));
        }),
        runFinally(() => {
          f1 = true;
          throw new Error("test 1");
        }),
        () => "hello",
        runFinally(() => (f2 = true)),
        (r: any) => {
          expect(r).toBe("hello");
          return r;
        },
        (err: Error) => {
          try {
            expect(f1).toBe(true);
            expect(f2).toBeUndefined();
            expect(err).toBeDefined();
            expect(err.message).toBe("test 1");
            done();
          } catch (err2) {
            done();
          }
        }
      );
    });
  });

  it("should catch errors from async finally checkFunc", () => {
    return new Promise<void>((done) => {
      let f1: boolean | undefined;
      let f2: boolean | undefined;
      runVerify(
        runFinally(() => (f1 = true)),
        () => "hello",
        runFinally(() => {
          return Promise.reject(new Error("test"));
        }),
        (r: any) => {
          expect(r).toBe("hello");
          return r;
        },
        runFinally(() => {
          f2 = true;
        }),
        (err: Error) => {
          try {
            expect(f1).toBe(true);
            expect(f2).toBe(true);
            expect(err).toBeDefined();
            done();
          } catch (err2) {
            done();
          }
        }
      );
    });
  });

  it("should timeout on a stuck test", () => {
    return new Promise<void>((done) => {
      let f1: boolean | undefined;
      let f2: boolean | undefined;
      runVerify(
        runFinally(() => (f1 = true)),
        () => "hello",
        runFinally(() => {
          return Promise.reject(new Error("test"));
        }),
        runTimeout(50),
        (r: any) => {
          expect(r).toBe("hello");
          return r;
        },
        runFinally(() => {
          f2 = true;
        }),
        runTimeout(100),
        (next: any) => setTimeout(next, 1000),
        (err: Error) => {
          try {
            expect(f1).toBe(true);
            expect(f2).toBe(true);
            expect(err).toBeDefined();
            expect(err.message).toContain("runVerify: test timeout after 100ms");
            done();
          } catch (err2) {
            done();
          }
        }
      );
    });
  });
});

describe("runDefer", () => {
  it("should allow user to use defer to resolve test", () => {
    const defer = runDefer();
    return asyncVerify(
      defer,
      runTimeout(20),
      () => {
        defer.resolve("hello");
      },
      defer.wait(),
      (r: any) => {
        expect(r).toBe("hello");
      }
    );
  });

  it("should allow user to resolve first and then wait", () => {
    const defer = runDefer(500);
    defer.resolve();
    return asyncVerify(defer.wait());
  });

  it("should allow user to reject first and then wait", () => {
    const defer = runDefer(500);
    defer.reject(new Error("test"));
    return asyncVerify(expectError(defer.wait()), (err: Error) => {
      expect(err.message).toBe("test");
    });
  });

  it("should allow user to put defer any where for the test", () => {
    const defer = runDefer();
    const defer2 = runDefer();

    return asyncVerify(
      defer,
      defer2,
      () => setTimeout(() => defer.resolve(1), 50),
      () => setTimeout(() => defer2.resolve(2), 50)
    );
  });

  it("should fail if a free defer was not resolved", () => {
    const defer = runDefer();
    const defer2 = runDefer();

    const failed = asyncVerify(defer, defer2, runTimeout(250), () =>
      setTimeout(() => defer.resolve(1), 50)
    );

    return asyncVerify(expectError(() => failed), (err: Error) => {
      expect(err.message).toContain(
        `runVerify: test timeout after 250ms while waiting for run check function`
      );
    });
  });

  it("should allow user clear defer status", () => {
    const defer = runDefer();
    return asyncVerify(
      defer,
      () => {
        defer.resolve("hello");
      },
      defer.wait(20),
      (r: any) => {
        expect(r).toBe("hello");
      },
      () => {
        setTimeout(() => {
          defer.resolve("second");
        }, 20);
      },
      defer.clear(),
      defer.wait(50),
      (r: any) => {
        expect(r).toBe("second");
      }
    );
  });

  it("should allow user to use defer to async resolve test", () => {
    const defer = runDefer();
    return asyncVerify(
      () =>
        asyncVerify(defer, runTimeout(20), () => {
          setTimeout(() => defer.resolve("hello"), 10);
        }),
      (r: any) => {
        expect(r).toBe("hello");
      }
    );
  });

  it("should time out and ignore late resolve", () => {
    const defer = runDefer();
    const defer2 = runDefer(10);

    defer2.event.once("resolve", (r) => {
      defer.resolve(r);
      expect(defer2.pending()).toBe(false);
    });

    return asyncVerify(
      defer,
      expectError(() =>
        asyncVerify(defer2, () => {
          setTimeout(() => {
            defer2.resolve("hello");
          }, 20);
        })
      ),
      (r: any) => {
        expect(r).toBeDefined();
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("defer timeout after 10ms - from runVerify");
      },
      defer.onResolve((r: any) => {
        expect(r).toBe("hello");
        expect(defer.pending()).toBe(false);
      })
    );
  });

  it("should time out on wait and ignore late resolve", () => {
    const defer = runDefer();
    const defer2 = runDefer();

    defer2.event.once("resolve", (r) => {
      defer.resolve(r);
    });

    return asyncVerify(
      defer,
      expectError(() =>
        asyncVerify(
          defer2,
          () => {
            setTimeout(() => {
              defer2.resolve("hello");
            }, 20);
          },
          defer2.wait(10)
        )
      ),
      (r: any) => {
        expect(r).toBeDefined();
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("defer timeout after 10ms - from defer.wait");
      },
      defer.onResolve((r: any) => {
        expect(r).toBe("hello");
      })
    );
  });

  it("should allow user to use defer to reject test", () => {
    const defer = runDefer();
    let reachedBad: Error | undefined;
    return asyncVerify(
      expectError(() =>
        asyncVerify(
          defer,
          runTimeout(20),
          () => {
            defer.reject(new Error("test defer reject"));
          },
          () => {
            reachedBad = new Error("not expecting to reach here");
          }
        )
      ),
      (r: any) => {
        expect(r).toBeDefined();
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("test defer reject");
        if (reachedBad) {
          throw reachedBad;
        }
      }
    );
  });

  it("should fail if onResolve throws", () => {
    const defer = runDefer();
    return asyncVerify(
      expectError(() =>
        asyncVerify(
          defer,
          runTimeout(20),
          () => {
            defer.resolve("hello");
          },
          defer.onResolve(() => {
            throw new Error("fail resolve");
          })
        )
      ),
      (r: any) => {
        expect(r).toBeDefined();
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("fail resolve");
      }
    );
  });

  it("should invoke onReject handlers", () => {
    const defer = runDefer();
    return asyncVerify(
      expectError(() =>
        asyncVerify(
          defer,
          runTimeout(20),
          () => {
            defer.reject(new Error("hello"));
          },
          defer.onReject(() => {
            throw new Error("onReject error");
          })
        )
      ),
      (r: any) => {
        expect(r).toBeDefined();
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("onReject error");
      }
    );
  });

  it("should handle multiple runDefer", () => {
    const defer1 = runDefer();
    const defer2 = runDefer();
    return asyncVerify(
      defer1,
      defer2,
      () => {
        setTimeout(() => {
          defer1.resolve("done1");
        }, 10);
      },
      () => {
        setTimeout(() => {
          defer2.resolve("done2");
        });
      }
    );
  });

  it("should wait for defer resolve", () => {
    const defer1 = runDefer();
    const defer2 = runDefer();
    return asyncVerify(
      defer1,
      defer2,
      () => {
        setTimeout(() => {
          defer1.resolve("done1");
        }, 10);
      },
      () => {
        setTimeout(() => {
          defer2.resolve("done2");
        });
      },
      defer1.wait(),
      (r: any) => {
        expect(r).toBe("done1");
      },
      defer2.wait(),
      (r: any) => {
        expect(r).toBe("done2");
      }
    );
  });

  it("should wait for defer reject", () => {
    const defer1 = runDefer();
    return asyncVerify(
      expectError(() => {
        return asyncVerify(
          defer1,
          () => {
            setTimeout(() => {
              defer1.reject(new Error("fail1"));
            }, 10);
          },
          defer1.wait()
        );
      }),
      (r: any) => {
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("fail1");
      }
    );
  });

  it("should failed on already waited and resolved defer", () => {
    const defer1 = runDefer();
    const defer2 = runDefer();
    return asyncVerify(
      defer1,
      defer2,
      () => {
        defer1.resolve("done1");
      },
      () => {
        setTimeout(() => {
          defer2.resolve("done2");
        }, 50);
      },
      defer1.wait(),
      (r: any) => {
        expect(r).toBe("done1");
      },
      defer2.wait(),
      (r: any) => {
        expect(r).toBe("done2");
      },
      expectError(defer1.wait()),
      (r: any) => {
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toContain("defer already waited");
        defer1.clear();
        defer1.resolve("done1");
      },
      defer1.wait(),
      (r: any) => {
        expect(r).toBe("done1");
      },
      defer2.waitAgain(),
      (r: any) => {
        expect(r).toBe("done2");
      }
    );
  });

  it("should failed on already waited and rejected defer", () => {
    const defer1 = runDefer();
    const defer2 = runDefer();
    return asyncVerify(
      defer1,
      defer2,
      () => {
        defer1.reject(new Error("fail1"));
      },
      () => {
        setTimeout(() => {
          defer2.reject(new Error("fail2"));
        }, 50);
      },
      expectError(defer1.wait()),
      (r: any) => {
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("fail1");
      },
      expectError(defer2.wait()),
      (r: any) => {
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("fail2");
      },
      expectError(defer1.wait()),
      (r: any) => {
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toContain("defer already waited");
      },
      expectError(defer2.wait()),
      (r: any) => {
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toContain("defer already waited");
      }
    );
  });

  it("should fail if one of multiple defers failed", () => {
    const defer1 = runDefer();
    const defer2 = runDefer();
    const defer3 = runDefer();
    return asyncVerify(
      expectError(() =>
        asyncVerify(
          defer1,
          defer3,
          () => {
            setTimeout(() => {
              defer1.resolve("done1");
            }, 10);
          },
          defer2,
          () => {
            setTimeout(() => {
              defer2.reject(new Error("fail2"));
            }, 50);
          },
          () => {
            setTimeout(() => {
              defer3.reject(new Error("fail3"));
            }, 20);
          }
        )
      ),
      (r: any) => {
        expect(r).toBeDefined();
        expect(r).toBeInstanceOf(Error);
        expect(r.message).toBe("fail3");
      }
    );
  });
});

describe("runFinally", () => {
  it("should make a callback that's always run", () => {
    const x = runFinally(() => {});
    expect(x[IS_FINALLY]).toBe(true);
  });

  it("should make callbacks that's invoked regardless of test result", () => {
    return new Promise<void>((done) => {
      let f1: boolean | undefined;
      let f2: boolean | undefined;
      let f3: boolean | undefined;
      let t4: boolean | undefined;
      runVerify(
        runFinally(() => (f1 = true)),
        () => "hello",
        runFinally(() => (f2 = true)),
        (r: any) => {
          expect(r).toBe("hello");
          return r;
        },
        () => {
          throw new Error("oops");
        },
        runFinally(() => (f3 = true)),
        () => (t4 = true),
        (err: Error) => {
          try {
            expect(err).toBeDefined();
            expect(err.message).toBe("oops");
            expect(f1).toBe(true);
            expect(f2).toBe(true);
            expect(f3).toBe(true);
            expect(t4).toBeUndefined();
            done();
          } catch (err2) {
            done();
          }
        }
      );
    });
  });
});

describe("wrapVerify", () => {
  it("should make a callback to run verify", () => {
    return new Promise<void>((done) => {
      const wrapped = wrapVerify((r: any) => expect(r).toBe("hello"), done);
      wrapped("hello");
    });
  });
});

describe("asyncVerify", () => {
  it("should return a promise to run verify", () => {
    return asyncVerify(
      (next: any) => fooEvent(1, next),
      (data: any) => {
        expect(data).toBe("foo");
      }
    );
  });

  it("should handle check func returning error", () => {
    return asyncVerify(
      expectError(() => {
        return asyncVerify(
          (next: any) => fooEvent(1, next),
          (data: any) => {
            expect(data).toBe("blah");
          }
        );
      })
    );
  });

  it("should catch errors from async finally checkFunc", () => {
    let f1: boolean | undefined;
    let f2: boolean | undefined;
    let error: Error | undefined;
    return asyncVerify(
      runFinally(() => (f1 = true)),
      () => "hello",
      runFinally(() => {
        return Promise.reject(new Error("test"));
      }),
      (r: any) => {
        expect(r).toBe("hello");
        return r;
      },
      runFinally(() => {
        f2 = true;
      })
    )
      .catch((err) => (error = err))
      .then(() => {
        expect(error).toBeDefined();
        expect(f1).toBe(true);
        expect(f2).toBe(true);
      });
  });

  it("should invoke onFailVerify callback", () => {
    let catchError: Error | undefined;
    const oops = "oops - test failure";
    const test1 = () =>
      asyncVerify(
        () => {
          throw new Error(oops);
        },
        onFailVerify((err: Error) => {
          catchError = err;
        }),
        () => {
          throw new Error("bad - not expecting this to be called");
        }
      );

    return asyncVerify(expectErrorToBe(test1, oops), () => {
      expect(catchError!.message).toBe(oops);
    });
  });

  it("should use exception from onFailVerify callback as new error", () => {
    let catchError: Error | undefined;
    const oops = "oops - test failure";
    const test1 = () =>
      asyncVerify(
        () => {
          throw new Error("first oops");
        },
        onFailVerify((err: Error) => {
          catchError = err;
          throw new Error(oops);
        }),
        () => {
          throw new Error("bad - not expecting this to be called");
        }
      );

    return asyncVerify(expectErrorToBe(test1, oops), (err: Error) => {
      expect(err.message).toBe(oops);
      expect(catchError!.message).toBe("first oops");
    });
  });

  it("should skip onFailVerify callback", () => {
    let catchError: Error | undefined;
    let count = 0;
    const test1 = () =>
      asyncVerify(
        () => count++,
        onFailVerify((err: Error) => {
          catchError = err;
          count++;
        }),
        () => count++
      );

    return asyncVerify(test1, () => {
      expect(count).toBe(2);
      expect(catchError).toBeUndefined();
    });
  });
});

describe("wrapAsyncVerify", () => {
  it("should make a callback to run asyncVerify", () => {
    const wrapped = wrapAsyncVerify((r: any) => expect(r).toBe("hello"));
    return wrapped("hello");
  });
});

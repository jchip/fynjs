import { describe, it, expect } from "vitest";
import EventEmitter from "events";
import { verify } from "run-verify";
import PkgDistExtractor from "../../lib/pkg-dist-extractor";

describe("pkg-dist-extractor", function () {
  it("rejects the listener when extraction fails", () => {
    const fyn: any = {
      ensureProperPkgDir: () => Promise.resolve(null),
      getInstalledPkgDir: () => "/no/such/out/dir",
      createPkgOutDir: () => Promise.resolve(),
      // string result -> hardlink path -> central.replicate
      central: { replicate: () => Promise.reject(new Error("replicate boom")) },
    };
    const extractor = new PkgDistExtractor({ fyn });
    const listener = new EventEmitter();

    return verify({ timeout: 500 })
      .callbackStep<Error>((next) => {
        listener.once("fail", (err) => next(null, err));
        listener.once("done", () => next(new Error("unexpected done on failure")));

        extractor.addPkgDist({
          pkg: { name: "foo", version: "1.0.0" },
          result: "/some/central/store/path",
          listener,
        } as any);
      })
      .step((err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe("replicate boom");
      });
  });

  it("resolves the listener when the package is already extracted", () => {
    const pkgJson = { name: "foo", version: "1.0.0" };
    const fyn: any = {
      // returns json => already extracted at fullOutDir => early return
      ensureProperPkgDir: () => Promise.resolve(pkgJson),
      getInstalledPkgDir: () => "/already/extracted/dir",
    };
    const extractor = new PkgDistExtractor({ fyn });
    const listener = new EventEmitter();

    return verify({ timeout: 500 })
      .callbackStep<typeof pkgJson>((next) => {
        listener.once("done", (json) => next(null, json));
        listener.once("fail", (err) => next(err || new Error("unexpected fail")));

        extractor.addPkgDist({
          pkg: { name: "foo", version: "1.0.0" },
          result: "/some/central/store/path",
          listener,
        } as any);
      })
      .step((json) => {
        expect(json).toBe(pkgJson);
      });
  });
});

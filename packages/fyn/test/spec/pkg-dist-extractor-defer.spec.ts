import { describe, it, expect } from "vitest";
import EventEmitter from "events";
import PkgDistExtractor from "../../lib/pkg-dist-extractor";
import logger from "../../lib/logger";

//
// A package not yet in the central store reaches the extractor as a store job, so the store is
// written here and not in a download slot. When another install is storing the same package,
// the extractor moves it to the end of its queue and does the others first. It never defers a
// package something is waiting on, and never defers one twice.
//
describe("pkg-dist-extractor: central store jobs", () => {
  logger._logLevel = 999;

  const pkg = (name: string) => ({ name, version: "1.0.0" });

  /** an extractor whose store job for `busy` reports another install on the first deferrable try */
  const makeExtractor = (busy: string) => {
    const stores: Array<[string, boolean]> = [];
    const replicated: string[] = [];
    const extractor: any = new PkgDistExtractor({
      fyn: {
        getInstalledPkgDir: (name: string) => `/out/${name}`,
        ensureProperPkgDir: async () => null,
        createPkgOutDir: async () => undefined,
        loadJsonForPkg: async (p: { name: string }) => ({ name: p.name }),
        isNormalLayout: true,
        central: { replicate: async (integrity: string) => void replicated.push(integrity) }
      } as any
    });
    const job = (name: string) => ({
      integrity: `sha512-${name}`,
      store: async (deferIfBusy: boolean) => {
        stores.push([name, deferIfBusy]);
        return !(name === busy && deferIfBusy);
      }
    });
    return { extractor, job, stores, replicated };
  };

  it("stores, then replicates", async () => {
    const { extractor, job, stores, replicated } = makeExtractor("none");
    extractor.addPkgDist({ pkg: pkg("a"), result: job("a") });
    await extractor.wait();

    expect(stores).toEqual([["a", true]]);
    expect(replicated).toEqual(["sha512-a"]);
  });

  it("moves a busy package to the end of the queue, then stores it without deferring", async () => {
    const { extractor, job, stores, replicated } = makeExtractor("a");
    extractor.addPkgDist({ pkg: pkg("a"), result: job("a") });
    extractor.addPkgDist({ pkg: pkg("b"), result: job("b") });
    await extractor.wait();

    expect(stores.filter(([name]) => name === "a")).toEqual([
      ["a", true],
      ["a", false]
    ]);
    expect(replicated.indexOf("sha512-b")).toBeLessThan(replicated.indexOf("sha512-a"));
  });

  it("never defers a package something is waiting on", async () => {
    const { extractor, job, stores } = makeExtractor("a");
    extractor.addPkgDist({ pkg: pkg("a"), result: job("a"), listener: new EventEmitter() });
    await extractor.wait();

    expect(stores).toEqual([["a", false]]);
  });
});

import { describe, test, expect, vi } from "vitest";
// Imports AveAzul from src directly rather than through promise-lib, so this always exercises
// the AveAzul implementation even under USE_BLUEBIRD=true - same convention as the other files
// in this directory.
import { AveAzul } from "../../src/index.ts";
import { Disposer } from "../../src/disposer.ts";

//
// The internal shape of what .disposer() returns. This lived in test/disposer.test.ts and made
// that file permanently fail in bluebird mode, because bluebird returns its own FunctionDisposer
// with different internals (FPM-127). It is real coverage of AveAzul's own contract with itself,
// so it moved here rather than being deleted.
//
describe("AveAzul.prototype.disposer internals", () => {
  test("should return a Disposer holding the cleanup fn and the source promise", () => {
    const resource = { value: "test" };
    const cleanup = vi.fn();

    const disposer = AveAzul.resolve(resource).disposer(cleanup);

    expect(disposer).toBeInstanceOf(Disposer);
    expect(disposer._data).toBe(cleanup);
    expect(disposer._promise).toBeInstanceOf(AveAzul);
  });
});

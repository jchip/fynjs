import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Fs from "node:fs";
import * as FsPromises from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { withPackLock } from "../src/utils.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), unlink: vi.fn(actual.unlink) };
});

describe("withPackLock", () => {
  let dir: string;
  let saveFile: string;
  let actual: typeof import("node:fs/promises");

  beforeEach(async () => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "publish-util-lock-"));
    saveFile = Path.join(dir, "saved.json");
    actual = await vi.importActual("node:fs/promises");
    vi.mocked(FsPromises.open).mockImplementation(actual.open);
    vi.mocked(FsPromises.unlink).mockImplementation(actual.unlink);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns the action result and removes the lock", async () => {
    await expect(withPackLock(saveFile, async () => "done")).resolves.toBe("done");
    expect(Fs.existsSync(`${saveFile}.lock`)).toBe(false);
  });

  it("retries a busy lock", async () => {
    const busy = Object.assign(new Error("busy"), { code: "EEXIST" });
    vi.mocked(FsPromises.open).mockRejectedValueOnce(busy);
    vi.spyOn(globalThis, "setTimeout").mockImplementationOnce(callback => {
      callback();
      return 0 as any;
    });

    await expect(withPackLock(saveFile, async () => "done")).resolves.toBe("done");
  });

  it("propagates lock creation errors", async () => {
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    vi.mocked(FsPromises.open).mockRejectedValueOnce(denied);

    await expect(withPackLock(saveFile, async () => undefined)).rejects.toBe(denied);
  });

  it("times out while the lock remains busy", async () => {
    const busy = Object.assign(new Error("busy"), { code: "EEXIST" });
    vi.mocked(FsPromises.open).mockRejectedValue(busy);
    vi.spyOn(globalThis, "setTimeout").mockImplementation(callback => {
      callback();
      return 0 as any;
    });

    await expect(withPackLock(saveFile, async () => undefined)).rejects.toThrow(
      `timed out waiting for pack lock ${saveFile}.lock`
    );
  });

  it("preserves an action error when lock cleanup also fails", async () => {
    const actionError = new Error("action failed");
    vi.mocked(FsPromises.unlink).mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      withPackLock(saveFile, async () => {
        throw actionError;
      })
    ).rejects.toBe(actionError);
  });
});

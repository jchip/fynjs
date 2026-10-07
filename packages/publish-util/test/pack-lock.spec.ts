import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Fs from "node:fs";
import * as FsPromises from "node:fs/promises";
import * as Os from "node:os";
import * as Path from "node:path";
import { spawnSync } from "node:child_process";
import { verify } from "run-verify";
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

  describe("stale locks", () => {
    let lockFile: string;
    const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid as number;
    // run the 10ms lock retries at once, leave other timers (the chain deadline) alone
    const fastRetries = () => {
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, ms?: number) => {
        if (ms === 10) {
          callback();
          return 0;
        }
        return realSetTimeout(callback, ms);
      }) as typeof setTimeout);
    };
    const holdLock = () =>
      withPackLock(saveFile, async stalePid => ({
        stalePid,
        lock: Fs.readFileSync(lockFile, "utf8")
      }));

    beforeEach(() => {
      lockFile = `${saveFile}.lock`;
    });

    it("records its pid in the lock it holds", () => {
      return verify({ timeout: 2000 })
        .step(holdLock)
        .keep.step(held => expect(held.lock).toBe(`${process.pid}\n`))
        .keep.step(held => expect(held.stalePid).toBeUndefined())
        .step(() => expect(Fs.existsSync(lockFile)).toBe(false));
    });

    it("takes over a lock whose recorded owner is gone", () => {
      const pid = deadPid();
      return verify({ timeout: 2000 })
        .step(() => Fs.writeFileSync(lockFile, `${pid}\n`))
        .step(holdLock)
        .keep.step(held => expect(held.stalePid).toBe(pid))
        .keep.step(held => expect(held.lock).toBe(`${process.pid}\n`))
        .step(() => expect(Fs.existsSync(lockFile)).toBe(false));
    });

    it("takes over a stale lock another waiter removed first", () => {
      const pid = deadPid();
      return verify({ timeout: 2000 })
        .step(() => {
          Fs.writeFileSync(lockFile, `${pid}\n`);
          vi.mocked(FsPromises.unlink).mockImplementationOnce(async file => {
            await actual.unlink(file);
            throw Object.assign(new Error("gone"), { code: "ENOENT" });
          });
        })
        .step(holdLock)
        .step(held => expect(held.stalePid).toBe(pid));
    });

    it("takes over an ownerless lock left long ago by an older publish-util", () => {
      return verify({ timeout: 2000 })
        .step(() => {
          Fs.writeFileSync(lockFile, "");
          const old = new Date(Date.now() - 60_000);
          Fs.utimesSync(lockFile, old, old);
        })
        .step(holdLock)
        .step(held => expect(held.stalePid).toBe(0));
    });

    it("waits on a fresh ownerless lock", () => {
      return verify({ timeout: 5000 })
        .step(() => {
          Fs.writeFileSync(lockFile, "");
          fastRetries();
        })
        .expectErrorHas(`timed out waiting for pack lock ${lockFile}`)
        .step(holdLock);
    });

    it("waits on a lock whose owner is alive", () => {
      return verify({ timeout: 5000 })
        .step(() => {
          Fs.writeFileSync(lockFile, `${process.pid}\n`);
          fastRetries();
        })
        .expectErrorHas(`timed out waiting for pack lock ${lockFile}`)
        .step(holdLock);
    });

    it("treats an owner it may not signal as alive", () => {
      return verify({ timeout: 5000 })
        .step(() => {
          Fs.writeFileSync(lockFile, "1\n");
          fastRetries();
        })
        .expectErrorHas(`timed out waiting for pack lock ${lockFile}`)
        .step(holdLock);
    });
  });
});

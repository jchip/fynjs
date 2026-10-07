import { describe, it, beforeEach, afterEach, expect } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";
import { spawn, spawnSync } from "child_process";
import { verify } from "run-verify";
import Fyn, { installLockOwnerGone } from "../../lib/fyn";

//
// An install holds .installing.lock and records its pid and host in it. A later install takes
// over a lock whose owner process on this host is gone, instead of failing until the lock is
// 30 minutes old.
//
describe("install lock", () => {
  let dir: string;
  let lockFile: string;
  // only the two methods createInstallLock and removeInstallLock use
  const fyn = () => ({
    createDir: (d: string) => Fs.promises.mkdir(d, { recursive: true }),
    getFvDir: (x?: string) => Path.join(dir, x || "")
  });
  const create = () => Fyn.prototype.createInstallLock.call(fyn());
  const remove = () => Fyn.prototype.removeInstallLock.call(fyn());
  const writeOwner = (owner: unknown) => Fs.writeFileSync(lockFile, JSON.stringify(owner));
  /** a pid that ran and exited */
  const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

  beforeEach(() => {
    dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fyn-install-lock-"));
    lockFile = Path.join(dir, ".installing.lock");
  });

  afterEach(() => {
    Fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is gone when the owner process exited", () =>
    verify({ timeout: 2000 })
      .step(() => writeOwner({ pid: deadPid(), host: Os.hostname() }))
      .step(() => installLockOwnerGone(lockFile))
      .step((gone) => expect(gone).toBe(true)));

  it("is not gone while the owner process runs", () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"]);
    return verify({ timeout: 2000, cleanup: () => child.kill() })
      .step(() => writeOwner({ pid: child.pid, host: Os.hostname() }))
      .step(() => installLockOwnerGone(lockFile))
      .step((gone) => expect(gone).toBe(false));
  });

  it("is not gone when the owner ran on another host", () =>
    verify({ timeout: 2000 })
      .step(() => writeOwner({ pid: deadPid(), host: `not-${Os.hostname()}` }))
      .step(() => installLockOwnerGone(lockFile))
      .step((gone) => expect(gone).toBe(false)));

  it("is not gone for a lock with no owner, from an older fyn", () =>
    verify({ timeout: 2000 })
      .step(() => Fs.writeFileSync(lockFile, ""))
      .step(() => installLockOwnerGone(lockFile))
      .step((gone) => expect(gone).toBe(false)));

  it("records its owner, and takes over a lock left by a process that exited", () =>
    verify({ timeout: 2000, cleanup: remove })
      .step(() => Fs.mkdirSync(dir, { recursive: true }))
      .step(() => writeOwner({ pid: deadPid(), host: Os.hostname() }))
      .step(() => create())
      .step((locked) => expect(locked).toBe(true))
      .step(() => JSON.parse(Fs.readFileSync(lockFile, "utf8")))
      .step((owner) => expect(owner).toEqual({ pid: process.pid, host: Os.hostname() })));
});

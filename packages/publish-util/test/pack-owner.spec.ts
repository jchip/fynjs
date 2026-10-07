import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { verify } from "run-verify";
import { liveOwners, packOwner } from "../src/utils.js";

vi.mock("child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

// a fake `ps -A -o pid=,ppid=,comm=` table: launchd <- tmux <- -zsh <- npm <- sh <- bash
const table = [
  "    1     0 /sbin/launchd",
  "  100     1 /opt/homebrew/bin/tmux",
  "  200   100 -zsh",
  "  300   200 /usr/local/bin/node",
  "  400   300 /bin/sh",
  "  500   400 bash",
  ""
].join("\n");

describe("packOwner", () => {
  afterEach(() => vi.restoreAllMocks());

  const fakePs = (ppid: number, output: string = table) => {
    vi.mocked(execFileSync).mockReturnValueOnce(output);
    vi.spyOn(process, "ppid", "get").mockReturnValue(ppid);
  };

  it("skips the shells between the script and the packer", () => {
    return verify({ timeout: 2000 })
      .step(() => fakePs(500))
      .step(packOwner)
      .step(owner => expect(owner).toBe(300));
  });

  it("returns the parent when it is not a shell", () => {
    return verify({ timeout: 2000 })
      .step(() => fakePs(300))
      .step(packOwner)
      .step(owner => expect(owner).toBe(300));
  });

  it("skips a login shell", () => {
    return verify({ timeout: 2000 })
      .step(() => fakePs(200))
      .step(packOwner)
      .step(owner => expect(owner).toBe(100));
  });

  it("returns 0 when the parent is not in the process table", () => {
    return verify({ timeout: 2000 })
      .step(() => fakePs(999))
      .step(packOwner)
      .step(owner => expect(owner).toBe(0));
  });

  it("returns 0 when the process table can't be read", () => {
    return verify({ timeout: 2000 })
      .step(() =>
        vi.mocked(execFileSync).mockImplementationOnce(() => {
          throw new Error("spawn ps ENOENT");
        })
      )
      .step(packOwner)
      .step(owner => expect(owner).toBe(0));
  });

  it("finds a live ancestor from the real process table", () => {
    return verify({ timeout: 2000 })
      .step(packOwner)
      .keep.step(owner => expect(owner).toBeGreaterThan(0))
      .step(owner => expect(() => process.kill(owner, 0)).not.toThrow());
  });
});

describe("liveOwners", () => {
  const meta = { pkgFile: "/pkg/package.json", pid: 1, ts: "" };
  const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid as number;

  it("drops dead owners and keeps live and unknown ones", () => {
    return verify({ timeout: 2000 })
      .step(deadPid)
      .step(dead => liveOwners({ ...meta, activePacks: 3, owners: [dead, process.pid, 0] }))
      .step(owners => expect(owners).toEqual([process.pid, 0]));
  });

  it("counts packs from a meta with no owners as unknown", () => {
    return verify({ timeout: 2000 })
      .step(() => liveOwners({ ...meta, activePacks: 2 }))
      .step(owners => expect(owners).toEqual([0, 0]))
      .step(() => liveOwners(meta))
      .step(owners => expect(owners).toEqual([0]));
  });

  it("ignores owners that disagree with activePacks", () => {
    // an older publish-util joined or left without updating owners
    return verify({ timeout: 2000 })
      .step(() => liveOwners({ ...meta, activePacks: 2, owners: [process.pid] }))
      .step(owners => expect(owners).toEqual([0, 0]));
  });
});

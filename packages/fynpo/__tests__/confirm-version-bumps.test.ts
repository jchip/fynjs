import { PassThrough } from "stream";
import { describe, expect, it, vi } from "vitest";
import { verify } from "run-verify";

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { logger } from "../src/logger";
import { confirmVersionBumps } from "../src/utils/confirm-version-bumps";
import { determinePackageVersions, findVersion } from "../src/utils/get-package-version";

const versions = { a: "1.2.3", b: "2.0.0", c: "3.4.5" };

/**
 * a collated result: `a` and `b` bump from their own commits (`a` at `aType`, `b` minor),
 * `c` follows along at `cType` with no commits of its own
 */
const makeCollated = (aType: number, cType = 0) => {
  const byName = Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [name, [{ pkgJson: { version } }]])
  );
  const collated: any = {
    opts: { graph: { packages: { byName } } },
    packages: {},
    directBumps: ["a", "b"],
    indirectBumps: ["c"],
  };
  const bump = (name, own, type) => {
    findVersion(name, type, collated);
    collated.packages[name].ownUpdateType = own;
  };
  bump("a", aType, aType);
  bump("b", 1, 1);
  bump("c", 0, cType);
  return collated;
};

const tty = () => {
  const input: any = new PassThrough();
  const output: any = new PassThrough();
  input.isTTY = output.isTTY = true;
  return { input, output, isCI: false };
};

/** answer each prompt in turn, as it is asked */
const answering = (io, answers: string[]) => {
  let prompts = "";
  io.output.on("data", (d) => {
    prompts += d.toString();
    if (prompts.endsWith("] ")) {
      const answer = answers.shift();
      answer === undefined ? io.input.end() : io.input.write(answer);
    }
  });
  return () => prompts;
};

const newVersions = (collated) =>
  Object.fromEntries(Object.keys(versions).map((n) => [n, collated.packages[n].newVersion]));

describe("confirmVersionBumps", () => {
  it("keeps minor bumps on an empty answer", () => {
    const collated = makeCollated(0);
    const io = tty();
    const prompts = answering(io, ["\n"]);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(true);
        expect(prompts()).toContain("Bump minor versions? [Y/n]");
        expect(prompts()).not.toContain("major");
        expect(newVersions(collated)).toEqual({ a: "1.2.4", b: "2.1.0", c: "3.4.6" });
      });
  });

  it("falls back to patch when minor is declined", () => {
    const collated = makeCollated(1);
    const io = tty();
    answering(io, ["n\n"]);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(true);
        expect(newVersions(collated)).toEqual({ a: "1.2.4", b: "2.0.1", c: "3.4.6" });
        expect(collated.packages.b.updateType).toBe(0);
      });
  });

  it("asks major first, then minor", () => {
    const collated = makeCollated(2);
    const io = tty();
    const prompts = answering(io, ["y\n", "\n"]);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(true);
        expect(prompts().indexOf("[y/N]")).toBeLessThan(prompts().indexOf("[Y/n]"));
        expect(newVersions(collated)).toEqual({ a: "2.0.0", b: "2.1.0", c: "3.4.6" });
      });
  });

  it("stops when major is declined", () => {
    const collated = makeCollated(2);
    const io = tty();
    const prompts = answering(io, ["\n"]);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(false);
        expect(prompts()).not.toContain("[Y/n]");
      });
  });

  it("stops when input closes at the minor prompt", () => {
    const collated = makeCollated(0);
    const io = tty();
    answering(io, []);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => expect(ok).toBe(false));
  });

  it("proceeds without asking when there is no terminal", () => {
    const collated = makeCollated(2);
    return verify()
      .step(() => confirmVersionBumps(collated, { ...tty(), isCI: true }))
      .step((ok) => {
        expect(ok).toBe(true);
        expect(newVersions(collated)).toEqual({ a: "2.0.0", b: "2.1.0", c: "3.4.6" });
      });
  });

  it("shows packages that follow along and patches them too when minor is declined", () => {
    const collated = makeCollated(0, 1);
    collated.packages.c.bumpReasons = [
      { reason: "locked", by: "b" },
      { reason: "depends", by: "a" },
    ];
    collated.packages.b.bumpMsgs = [
      { id: "0123456789abcdef", m: "feat: add b thing\n\nbody" },
      { id: "fedcba9876543210", m: "[minor] tweak b" },
    ];
    const io = tty();
    answering(io, ["n\n"]);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(true);
        const shown = (logger.warn as any).mock.calls.at(-1)[0];
        expect(shown).toContain(
          [
            "  b: 2.0.0 -> 2.1.0",
            "    01234567: feat: add b thing",
            "    fedcba98: [minor] tweak b",
            "Bumped along with them:",
            "  c: 3.4.5 -> 3.5.0 (locked with b)",
          ].join("\n")
        );
        expect(newVersions(collated)).toEqual({ a: "1.2.4", b: "2.0.1", c: "3.4.6" });
      });
  });

  it("does not prompt when only packages following along get a minor bump", () => {
    const collated = makeCollated(0, 1);
    findVersion("b", 0, collated);
    collated.packages.b.ownUpdateType = 0;
    const io = tty();
    const prompts = answering(io, []);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(true);
        expect(prompts()).toBe("");
        expect(collated.packages.c.newVersion).toBe("3.5.0");
      });
  });

  it("does not prompt for patch-only releases", () => {
    const collated = makeCollated(0);
    findVersion("b", 0, collated);
    collated.packages.b.ownUpdateType = 0;
    const io = tty();
    const prompts = answering(io, []);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(true);
        expect(prompts()).toBe("");
      });
  });

  it("explains follow-along bumps from the real version pipeline and logs the result", () => {
    // lib has a minor commit; lib-x is locked with it; app depends on it and inherits
    const byName = Object.fromEntries(
      ["lib", "lib-x", "app"].map((name) => [name, [{ pkgJson: { version: "1.0.0" } }]])
    );
    const collated: any = {
      opts: {
        graph: { packages: { byName } },
        fynpoRc: { versionCascade: { bumpType: "inherit" } },
        versionLockMap: {},
      },
      changed: {
        verLocks: { lib: ["lib", "lib-x"] },
        forceUpdated: [],
        depMap: { app: ["lib"] },
        depSections: { app: { lib: "dep" } },
      },
      realPackages: ["lib"],
      packages: { lib: { msgs: [{ id: "abcdef0123456789", m: "[minor] new api" }] } },
    };
    const io = tty();
    answering(io, ["n\n"]);
    return verify()
      .step(() => determinePackageVersions(collated))
      .step(() => confirmVersionBumps(collated, io))
      .step((ok) => {
        expect(ok).toBe(true);
        expect((logger.warn as any).mock.calls.at(-1)[0]).toContain(
          [
            "  lib: 1.0.0 -> 1.1.0",
            "    abcdef01: [minor] new api",
            "Bumped along with them:",
            "  lib-x: 1.0.0 -> 1.1.0 (locked with lib)",
            "  app: 1.0.0 -> 1.1.0 (depends on lib)",
          ].join("\n")
        );
        expect((logger.info as any).mock.calls.at(-1)[0]).toBe(
          [
            "Using patch bumps instead:",
            "  lib: 1.0.0 -> 1.0.1",
            "  lib-x: 1.0.0 -> 1.0.1",
            "  app: 1.0.0 -> 1.0.1",
          ].join("\n")
        );
      });
  });

  it("logs the confirmed minor versions", () => {
    const collated = makeCollated(0);
    const io = tty();
    answering(io, ["y\n"]);
    return verify()
      .step(() => confirmVersionBumps(collated, io))
      .step(() => {
        expect((logger.info as any).mock.calls.at(-1)[0]).toBe(
          ["Minor bumps confirmed:", "  b: 2.0.0 -> 2.1.0"].join("\n")
        );
      });
  });

  it("explains why direct packages locked together share a prompt", () => {
    const names = ["fyn", "fynpo", "fynpo-cli"];
    const byName = Object.fromEntries(
      names.map((name) => [name, [{ pkgJson: { version: "3.2.2" } }]])
    );
    const collated: any = {
      opts: { graph: { packages: { byName } }, fynpoRc: {}, versionLockMap: {} },
      changed: {
        verLocks: { fyn: names, fynpo: names },
        forceUpdated: [],
        depMap: {},
        depSections: {},
      },
      realPackages: ["fynpo", "fyn"],
      packages: {
        fynpo: { msgs: [{ id: "4c0432880000", m: "[minor] list commits" }] },
        fyn: { msgs: [{ id: "bfde271b0000", m: "[minor] skip central store" }] },
      },
    };
    const io = tty();
    answering(io, ["y\n"]);
    return verify()
      .step(() => determinePackageVersions(collated))
      .step(() => confirmVersionBumps(collated, io))
      .step(() => {
        expect((logger.warn as any).mock.calls.at(-1)[0]).toContain(
          [
            "  fynpo: 3.2.2 -> 3.3.0 (locked with fyn)",
            "    4c043288: [minor] list commits",
            "  fyn: 3.2.2 -> 3.3.0 (locked with fynpo)",
            "    bfde271b: [minor] skip central store",
            "Bumped along with them:",
            "  fynpo-cli: 3.2.2 -> 3.3.0 (locked with fynpo, fyn)",
            "One answer covers all of them. Answering no will bump all of them as patch instead.",
          ].join("\n")
        );
      });
  });
});

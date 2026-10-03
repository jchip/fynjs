import { PassThrough } from "stream";
import { describe, expect, it, vi } from "vitest";
import { verify } from "run-verify";

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { logger } from "../src/logger";
import { confirmVersionBumps } from "../src/utils/confirm-version-bumps";
import { findVersion } from "../src/utils/get-package-version";

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
            "Bumped along with them through version locks or dependencies:",
            "  c: 3.4.5 -> 3.5.0",
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
});

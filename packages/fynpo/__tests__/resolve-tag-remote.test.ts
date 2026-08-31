import { describe, it, expect } from "vitest";

import { resolveTagRemote } from "../src/utils";

//
// A release tag points at a commit, so `fynpo publish` must work from a branch that was never
// pushed. This used to read the `# branch.upstream` line and dereference it unconditionally,
// which threw a TypeError *after* every package was already on npm, leaving the release
// untagged (FPO-54).
//
describe("resolveTagRemote", () => {
  const status = (...lines: string[]) =>
    ["# branch.oid abcdef1234567890", "# branch.head main", ...lines].join("\n");

  describe("with a branch upstream", () => {
    it("takes the remote from the upstream", () => {
      expect(resolveTagRemote(status("# branch.upstream origin/main"), "origin\n")).toBe("origin");
    });

    it("prefers the upstream remote over origin", () => {
      expect(resolveTagRemote(status("# branch.upstream fork/main"), "fork\norigin\n")).toBe(
        "fork"
      );
    });

    it("keeps the remote when the branch name contains slashes", () => {
      expect(
        resolveTagRemote(status("# branch.upstream origin/feature/FPO-54/fix"), "origin\n")
      ).toBe("origin");
    });

    it("ignores the ahead/behind line that follows it", () => {
      const out = status("# branch.upstream origin/main", "# branch.ab +2 -0");
      expect(resolveTagRemote(out, "origin\n")).toBe("origin");
    });
  });

  describe("without a branch upstream", () => {
    it("falls back to origin", () => {
      expect(resolveTagRemote(status(), "origin\nupstream\n")).toBe("origin");
    });

    it("falls back to the sole configured remote when there is no origin", () => {
      expect(resolveTagRemote(status(), "fork\n")).toBe("fork");
    });

    //
    // Guessing between several remotes would push a release tag somewhere the user never asked
    // for, so this deliberately gives up and the tag stays local.
    //
    it("gives up when several remotes exist and none is origin", () => {
      expect(resolveTagRemote(status(), "fork\nbackup\n")).toBe("");
    });

    it("gives up when there are no remotes at all", () => {
      expect(resolveTagRemote(status(), "")).toBe("");
    });

    it("handles a detached HEAD, which has no branch lines at all", () => {
      expect(resolveTagRemote("# branch.oid abcdef1234567890\n# branch.head (detached)\n", "")).toBe(
        ""
      );
    });
  });

  describe("degenerate input", () => {
    it("does not throw on empty output", () => {
      expect(resolveTagRemote("", "")).toBe("");
    });

    it("does not throw on undefined output", () => {
      expect(resolveTagRemote(undefined as any, undefined as any)).toBe("");
    });

    //
    // `branch.upstream` also appears inside git's own config output; only the porcelain=v2
    // header line, which starts with `# `, may be parsed as one.
    //
    it("ignores a line that merely mentions branch.upstream", () => {
      expect(resolveTagRemote("branch.upstream origin/main\n", "")).toBe("");
    });

    it("ignores a truncated upstream header", () => {
      expect(resolveTagRemote("# branch.upstream \n", "origin\n")).toBe("origin");
    });
  });
});

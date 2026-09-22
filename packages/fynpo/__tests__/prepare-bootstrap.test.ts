import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fs from "fs";
import Path from "path";
import { execFileSync } from "node:child_process";
import { FynpoDepGraph } from "@fynpo/base";
import { verify } from "run-verify";
import { Prepare } from "../src/prepare";
import { Bootstrap } from "../src/bootstrap";
import { Run } from "../src/run";

describe("prepare bootstrap and package hooks", () => {
  let cwd: string;
  let prepare: Prepare;
  let events: string[];
  const unusualOutput = "packages/b/-output $value `literal` 'single' \"double\".txt";
  const originalExitCode = process.exitCode;
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const write = (file: string, value: string) => {
    Fs.mkdirSync(Path.dirname(Path.join(cwd, file)), { recursive: true });
    Fs.writeFileSync(Path.join(cwd, file), value);
  };

  beforeEach(async () => {
    Fs.mkdirSync(".temp", { recursive: true });
    cwd = Fs.mkdtempSync(Path.resolve(".temp/prepare-bootstrap-"));
    events = [];
    process.exitCode = undefined;
    write(
      "fynpo.json",
      JSON.stringify({ packages: { autoSearch: false, include: ["packages/*"] } }),
    );
    write(".gitignore", "node_modules/\n");
    write("packages/a/package.json", JSON.stringify({ name: "a", version: "1.0.0" }));
    write(
      "packages/b/package.json",
      JSON.stringify({
        name: "b",
        version: "1.0.0",
        dependencies: { a: "^1.0.0" },
        scripts: { "fynpo:prepare": "custom-update" },
      }),
    );
    write("packages/b/generated.txt", "old");
    write("packages/b/obsolete.txt", "remove during prepare");
    write("packages/b/fyn-lock.yaml", "old lock");
    git("init", "-q");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "core.excludesFile", "/dev/null");
    git("add", ".");
    git("commit", "-qm", "initial");
    const graph = new FynpoDepGraph({
      cwd,
      packages: { autoSearch: false, include: ["packages/*"] },
    });
    await graph.resolve();
    prepare = new Prepare({ cwd, commit: true, tag: true, only: ["a"] }, graph);
    vi.spyOn(prepare, "readChangelog").mockImplementation(() => {
      prepare._versions = { a: "2.0.0" };
      prepare._tags = ["a@2.0.0"];
    });
    vi.spyOn(Bootstrap.prototype, "exec").mockImplementation(async function () {
      events.push("bootstrap");
      expect(this.graph.packages.byPath["packages/a"].version).toBe("2.0.0");
      expect(this.graph.packages.byPath["packages/b"].pkgJson.dependencies.a).toBe("^2.0.0");
      expect(this._opts.only).toBeUndefined();
      write("packages/a/fyn-lock.yaml", "new lock");
      write("packages/b/fyn-lock.yaml", "updated lock");
      Fs.mkdirSync(Path.join(cwd, "packages/b/node_modules"), { recursive: true });
    });
    vi.spyOn(Run.prototype, "runScript").mockImplementation(async function (pkg) {
      events.push("hook");
      expect(this._script).toBe("fynpo:prepare");
      expect(pkg.name).toBe("b");
      expect(Fs.readFileSync(Path.join(cwd, "packages/b/fyn-lock.yaml"), "utf8")).toBe(
        "updated lock",
      );
      write("packages/b/generated.txt", "updated");
      write("packages/b/new output.txt", "created");
      write(unusualOutput, "literal filename");
      Fs.rmSync(Path.join(cwd, "packages/b/obsolete.txt"), { force: true });
      return { stdout: "", stderr: "" };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
    Fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("bootstraps updated versions, runs dependent hooks, then commits lockfiles and tracked output", () =>
    verify({ timeout: 3000 })
      .step(() => prepare.exec())
      .step(() => {
        expect(events).toEqual(["bootstrap", "hook"]);
        expect(git("status", "--porcelain")).toBe("");
        expect(git("show", "HEAD:packages/b/generated.txt")).toBe("updated");
        expect(git("show", "HEAD:packages/b/new output.txt")).toBe("created");
        expect(git("show", `HEAD:${unusualOutput}`)).toBe("literal filename");
        expect(git("ls-tree", "HEAD", "packages/b/obsolete.txt")).toBe("");
        expect(git("show", "HEAD:packages/a/fyn-lock.yaml")).toBe("new lock");
        expect(git("show", "HEAD:packages/b/fyn-lock.yaml")).toBe("updated lock");
        expect(git("rev-parse", "a@2.0.0")).toBe(git("rev-parse", "HEAD"));
      }));

  it("still bootstraps and runs hooks with --no-commit", () => {
    prepare._options.commit = false;
    return verify({ timeout: 3000 })
      .step(() => prepare.exec())
      .step(() => {
        expect(events).toEqual(["bootstrap", "hook"]);
        expect(git("log", "-1", "--format=%s").trim()).toBe("initial");
        expect(git("tag")).toBe("");
      });
  });

  it("stops before hooks, commit, and tags when bootstrap fails", () => {
    vi.mocked(Bootstrap.prototype.exec).mockRejectedValue(new Error("bootstrap failed"));
    return verify({ timeout: 3000 })
      .expectErrorHas("bootstrap failed")
      .step(() => prepare.exec())
      .step(() => {
        expect(Run.prototype.runScript).not.toHaveBeenCalled();
        expect(git("log", "-1", "--format=%s").trim()).toBe("initial");
        expect(git("tag")).toBe("");
      });
  });

  it("stops before committing when a hook reports a nonzero exit", () => {
    vi.mocked(Run.prototype.runScript).mockResolvedValue({
      failed: true,
      exitCode: 7,
      stdout: "",
      stderr: "hook failed",
    });
    return verify({ timeout: 3000 })
      .expectErrorHas("fynpo:prepare")
      .step(() => prepare.exec())
      .step(() => {
        expect(process.exitCode).toBe(7);
        expect(git("log", "-1", "--format=%s").trim()).toBe("initial");
        expect(git("tag")).toBe("");
      });
  });

  it.each(["unstaged", "staged", "untracked"])(
    "refuses a %s dirty tree before changing any package",
    (kind) => {
      write(kind === "untracked" ? "unrelated.txt" : "packages/b/generated.txt", "user work");
      if (kind === "staged") git("add", "packages/b/generated.txt");
      const before = git("status", "--porcelain");
      return verify({ timeout: 3000 })
        .expectErrorHas("dirty working tree")
        .step(() => prepare.exec())
        .step(() => {
          expect(prepare.readChangelog).not.toHaveBeenCalled();
          expect(Bootstrap.prototype.exec).not.toHaveBeenCalled();
          expect(Run.prototype.runScript).not.toHaveBeenCalled();
          expect(git("status", "--porcelain")).toBe(before);
          expect(
            JSON.parse(Fs.readFileSync(Path.join(cwd, "packages/a/package.json"), "utf8")).version,
          ).toBe("1.0.0");
        });
    },
  );

  it("stops if bootstrap reports failed packages without rejecting", () => {
    vi.spyOn(Bootstrap.prototype, "failed", "get").mockReturnValue(1);
    return verify({ timeout: 3000 })
      .expectErrorHas("bootstrap failed")
      .step(() => prepare.exec())
      .step(() => {
        expect(Run.prototype.runScript).not.toHaveBeenCalled();
        expect(git("log", "-1", "--format=%s").trim()).toBe("initial");
      });
  });

  it("bootstraps successfully when no package declares a hook", async () => {
    const file = Path.join(cwd, "packages/b/package.json");
    const pkg = JSON.parse(Fs.readFileSync(file, "utf8"));
    delete pkg.scripts;
    Fs.writeFileSync(file, JSON.stringify(pkg));
    git("add", ".");
    git("commit", "-qm", "remove hook");
    // Refresh the initial graph just as the CLI does at startup.
    const graph = new FynpoDepGraph(prepare._options);
    await graph.resolve();
    const next = new Prepare(prepare._options, graph);
    next.readChangelog = prepare.readChangelog;
    next._versions = { a: "2.0.0" };
    next._tags = ["a@2.0.0"];
    return verify({ timeout: 3000 })
      .step(() => next.exec())
      .step(() => {
        expect(events).toEqual(["bootstrap"]);
        expect(git("status", "--porcelain")).toBe("");
      });
  });

  it("repeats bootstrap when recorded dependency data changes", () => {
    const bootstrap = vi.mocked(Bootstrap.prototype.exec);
    const original = bootstrap.getMockImplementation();
    bootstrap.mockImplementation(async function (opts) {
      await original.call(this, opts);
      write(".fynpo-data.json", JSON.stringify({ __timestamp: 1, indirects: {} }));
    });
    return verify({ timeout: 3000 })
      .step(() => prepare.exec())
      .step(() => {
        expect(events).toEqual(["bootstrap", "bootstrap", "hook"]);
        expect(git("show", "HEAD:.fynpo-data.json")).toContain('"__timestamp":1');
      });
  });

  it("commits all outputs when the workspace is inside a Git repository", () =>
    verify({ timeout: 3000 })
      .step(async () => {
        Fs.mkdirSync(Path.join(cwd, "workspace"));
        git("mv", "fynpo.json", "packages", "workspace/");
        git("commit", "-qm", "nest workspace");
        const workspace = Path.join(cwd, "workspace");
        const graph = new FynpoDepGraph({ cwd: workspace });
        await graph.resolve();
        const next = new Prepare({ cwd: workspace, commit: true, tag: true }, graph);
        next.readChangelog = () => {
          next._versions = { a: "2.0.0" };
          next._tags = ["a@2.0.0"];
        };
        vi.mocked(Bootstrap.prototype.exec).mockImplementation(async function () {
          expect(this.graph.packages.byPath["packages/a"].version).toBe("2.0.0");
          write("workspace/packages/a/fyn-lock.yaml", "nested lock");
          Fs.mkdirSync(Path.join(workspace, "packages/b/node_modules"), { recursive: true });
        });
        vi.mocked(Run.prototype.runScript).mockImplementation(async () => {
          write("workspace/packages/b/new.txt", "inside");
          write("outside.txt", "outside");
          return { stdout: "", stderr: "" };
        });
        return next;
      })
      .step((next) => next.exec())
      .step(() => {
        expect(git("status", "--porcelain")).toBe("");
        expect(git("show", "HEAD:workspace/packages/a/fyn-lock.yaml")).toBe("nested lock");
        expect(git("show", "HEAD:workspace/packages/b/new.txt")).toBe("inside");
        expect(git("show", "HEAD:outside.txt")).toBe("outside");
      }));

  it.each([false, true])("handles unchanged versions and dependency ranges with force=%s", (force) =>
    verify({ timeout: 3000 })
      .step(() => prepare.exec())
      .step(async () => {
        const before = git("rev-parse", "HEAD");
        events = [];
        const graph = new FynpoDepGraph(prepare._options);
        await graph.resolve();
        const next = new Prepare({ ...prepare._options, force }, graph);
        vi.spyOn(next, "readChangelog").mockImplementation(() => {
          next._versions = { a: "2.0.0" };
          next._tags = ["a@2.0.0"];
        });
        vi.spyOn(next, "bootstrapAndRunHooks");
        vi.spyOn(next, "getReleaseFiles");
        vi.spyOn(next, "commitAndTagUpdates");
        return { next, before };
      })
      .keep.step(({ next }) => next.exec())
      .step(({ next, before }) => {
        expect(events).toEqual(force ? ["bootstrap", "hook"] : []);
        expect(next.bootstrapAndRunHooks).toHaveBeenCalledTimes(force ? 1 : 0);
        expect(next.getReleaseFiles).toHaveBeenCalledTimes(force ? 1 : 0);
        expect(next.commitAndTagUpdates).not.toHaveBeenCalled();
        expect(git("rev-parse", "HEAD")).toBe(before);
        expect(git("status", "--porcelain")).toBe("");
      }));

  it("still bootstraps and runs hooks when only a dependent range needs updating", () =>
    verify({ timeout: 3000 })
      .step(async () => {
        write("packages/a/package.json", JSON.stringify({ name: "a", version: "2.0.0" }));
        git("add", ".");
        git("commit", "-qm", "producer already updated");
        const graph = new FynpoDepGraph(prepare._options);
        await graph.resolve();
        const next = new Prepare(prepare._options, graph);
        next.readChangelog = () => {
          next._versions = { a: "2.0.0" };
          next._tags = ["a@2.0.0"];
        };
        return next;
      })
      .step(next => next.exec())
      .step(() => {
        expect(events).toEqual(["bootstrap", "hook"]);
        const pkg = JSON.parse(git("show", "HEAD:packages/b/package.json"));
        expect(pkg.version).toBe("1.0.0");
        expect(pkg.dependencies.a).toBe("^2.0.0");
        expect(git("status", "--porcelain")).toBe("");
      }));
});

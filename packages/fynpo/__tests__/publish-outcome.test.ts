import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../src/release-output", () => ({
  printHeader: vi.fn(),
  printSection: vi.fn(),
  printList: vi.fn(),
  printSuccess: vi.fn(),
  printWarning: vi.fn(),
  printError: vi.fn(),
  printNextSteps: vi.fn(),
  printCommand: (x: string) => x,
}));

vi.mock("fyn/bin/index.js", () => ({ default: { run: vi.fn() } }));

const shellRm = vi.fn();
vi.mock("shelljs", () => ({
  default: { pushd: vi.fn(), popd: vi.fn(), rm: (...args: any[]) => shellRm(...args) },
}));

/** commands the code ran, in order */
const cmds: string[] = [];
/** what a given command does - return output, or throw to make it fail */
let handler: (cmd: string) => { stdout?: string; stderr?: string } = () => ({});

const runCmd = (_opts: any, cmd: string) => {
  cmds.push(cmd);
  const promise = Promise.resolve().then(() => {
    const out = handler(cmd) || {};
    return { stdout: out.stdout || "", stderr: out.stderr || "" };
  });
  return {
    promise,
    then: (a: any, b: any) => promise.then(a, b),
    catch: (a: any) => promise.catch(a),
  };
};
vi.mock("xsh", () => ({ default: { exec: (...args: any[]) => (runCmd as any)(...args) } }));

/** packages the topo runner hands to the pack phase */
let topoPackages: any[] = [];
vi.mock("../src/topo-runner", () => ({
  TopoRunner: class {
    constructor(_sorted: any, _opts: any) {}
    async start({ processor }: any) {
      for (const pkg of topoPackages) {
        await processor(pkg);
      }
    }
  },
}));

import Fs from "fs";
import Os from "os";
import Path from "path";
import Publish from "../src/publish";
import { isAlreadyPublishedError } from "../src/utils";

const pkg = (name: string, version: string) => ({
  name,
  version,
  path: `packages/${name}`,
  pkgJson: {},
});

const tgzOf = (p: { name: string; version: string }) =>
  `${p.name.replace(/\//g, "-").replace(/@/g, "")}-${p.version}.tgz`;

/** the shape npm answers with when the registry already has that version */
const conflictErr = (name: string, version: string) => {
  const err: any = new Error(`shell cmd 'npm publish' exit code 1`);
  err.code = 1;
  err.output = {
    stdout: "",
    stderr: [
      `npm error code EPUBLISHCONFLICT`,
      `npm error 403 403 Forbidden - PUT https://registry.npmjs.org/${name} - You cannot ` +
        `publish over the previously published versions: ${version}.`,
    ].join("\n"),
  };
  return err;
};

/** a failure that is not a conflict - it happens to also be a 403 */
const noRightsErr = (name: string) => {
  const err: any = new Error(`shell cmd 'npm publish' exit code 1`);
  err.code = 1;
  err.output = {
    stdout: "",
    stderr: [
      `npm error code E403`,
      `npm error 403 403 Forbidden - PUT https://registry.npmjs.org/${name} - You do not have ` +
        `permission to publish "${name}". Are you logged in as the correct user?`,
    ].join("\n"),
  };
  return err;
};

describe("isAlreadyPublishedError", () => {
  it("accepts EPUBLISHCONFLICT for the version being published", () => {
    expect(isAlreadyPublishedError(conflictErr("fyn", "2.0.0").output.stderr, "2.0.0")).toBe(true);
  });

  it("rejects a conflict reported for some other version", () => {
    // npm answering about a version we did not publish means something is off - stay a failure
    expect(isAlreadyPublishedError(conflictErr("fyn", "1.9.0").output.stderr, "2.0.0")).toBe(false);
  });

  it("rejects a 403 that is not a conflict", () => {
    expect(isAlreadyPublishedError(noRightsErr("fyn").output.stderr, "2.0.0")).toBe(false);
  });

  it("accepts the conflict wording without a version", () => {
    const text = "npm ERR! code EPUBLISHCONFLICT\nnpm ERR! publish fail";
    expect(isAlreadyPublishedError(text, "2.0.0")).toBe(true);
  });

  it("accepts the message wording alone, without the code", () => {
    const text = "You cannot publish over the previously published versions: 3.1.0.";
    expect(isAlreadyPublishedError(text, "3.1.0")).toBe(true);
  });

  it("is false for empty or unrelated output", () => {
    expect(isAlreadyPublishedError("", "2.0.0")).toBe(false);
    expect(isAlreadyPublishedError("npm error network timeout", "2.0.0")).toBe(false);
  });
});

describe("publishPackages outcome", () => {
  const a = pkg("a", "1.0.0");
  const b = pkg("b", "2.0.0");

  const makePublish = () => {
    const graph = { packages: { byId: {} }, getTopoSortPackages: () => [] } as any;
    const publish = new Publish({ cwd: "/repo", dryRun: false, push: false }, graph);
    publish._packagesToPublish = [a, b] as any;
    return publish;
  };

  beforeEach(() => {
    cmds.length = 0;
    shellRm.mockReset();
    topoPackages = [a, b];
    handler = () => ({});
  });

  it("reports no failures when every package publishes", async () => {
    const outcome = await makePublish().publishPackages();

    expect(outcome).toEqual({ failures: [], alreadyPublished: [] });
    expect(cmds.filter((c) => c.startsWith("npm publish"))).toHaveLength(2);
  });

  it("treats an already-published version as a success, not a failure", async () => {
    handler = (cmd) => {
      if (cmd.includes(tgzOf(a))) throw conflictErr(a.name, a.version);
      if (cmd.includes(tgzOf(b))) throw conflictErr(b.name, b.version);
      return {};
    };

    const outcome = await makePublish().publishPackages();

    expect(outcome.failures).toEqual([]);
    expect(outcome.alreadyPublished).toEqual(["a@1.0.0", "b@2.0.0"]);
  });

  it("mixes conflicts and fresh publishes without either becoming a failure", async () => {
    handler = (cmd) => {
      if (cmd.includes(tgzOf(a))) throw conflictErr(a.name, a.version);
      return {};
    };

    const outcome = await makePublish().publishPackages();

    expect(outcome.failures).toEqual([]);
    expect(outcome.alreadyPublished).toEqual(["a@1.0.0"]);
  });

  it("keeps a genuine failure a failure", async () => {
    handler = (cmd) => {
      if (cmd.includes(tgzOf(b))) throw noRightsErr(b.name);
      return {};
    };

    const outcome = await makePublish().publishPackages();

    expect(outcome.failures).toHaveLength(1);
    expect(outcome.alreadyPublished).toEqual([]);
  });

  it("cleans up the tarball of a package that was already published", async () => {
    handler = (cmd) => {
      if (cmd.includes(tgzOf(a))) throw conflictErr(a.name, a.version);
      return {};
    };

    await makePublish().publishPackages();

    expect(shellRm.mock.calls.map((c) => Path.basename(c[0])).sort()).toEqual(
      [tgzOf(a), tgzOf(b)].sort()
    );
  });

  it("publishes nothing on a dry run", async () => {
    const graph = { packages: { byId: {} }, getTopoSortPackages: () => [] } as any;
    const publish = new Publish({ cwd: "/repo", dryRun: true, push: false }, graph);
    publish._packagesToPublish = [a, b] as any;

    const outcome = await publish.publishPackages();

    expect(outcome).toEqual({ failures: [], alreadyPublished: [] });
    expect(cmds.filter((c) => c.startsWith("npm publish"))).toHaveLength(0);
  });
});

describe("publish exit code and release tag", () => {
  const a = pkg("a", "1.0.0");
  const b = pkg("b", "2.0.0");

  let cwd: string;
  let exitSpy: any;

  const runExec = async () => {
    const graph = {
      packages: { byId: { "a@1.0.0": a, "b@2.0.0": b } },
      getTopoSortPackages: () => [],
    } as any;
    const publish = new Publish({ cwd, dryRun: false, push: false }, graph);
    await publish.exec();
  };

  beforeEach(() => {
    cwd = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fynpo-publish-"));
    Fs.writeFileSync(
      Path.join(cwd, "package.json"),
      JSON.stringify({ name: "root", version: "1.0.0", private: true })
    );

    cmds.length = 0;
    shellRm.mockReset();
    topoPackages = [a, b];

    // process.exit does not return, so throwing stands in for it and lets the test see the code
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as any);

    handler = (cmd) => {
      if (cmd.startsWith("git tag --points-at")) return { stdout: "" };
      if (cmd.startsWith("git diff-tree")) {
        return { stdout: "packages/a/package.json\npackages/b/package.json\n" };
      }
      if (cmd.startsWith("git log -1")) {
        return { stdout: "[Publish]\n\n - a@1.0.0\n - b@2.0.0\n" };
      }
      if (cmd.startsWith("git log --format")) return { stdout: "abcdef1234\n" };
      if (cmd.startsWith("git status")) return { stdout: "# branch.upstream origin/main\n" };
      if (cmd.startsWith("git remote")) return { stdout: "origin\n" };
      return {};
    };
  });

  afterEach(() => {
    exitSpy.mockRestore();
    Fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("tags the release when every package published", async () => {
    await runExec();

    expect(cmds.some((c) => c.startsWith("git tag -a fynpo-rel-"))).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  //
  // This is the FPO-56 regression: a resumed release re-publishes what the interrupted run
  // already shipped, every package ends up on npm at the wanted version, and the tag had to be
  // created by hand because those conflicts counted as failures.
  //
  it("still tags the release when every package was already published", async () => {
    const base = handler;
    handler = (cmd) => {
      if (cmd.includes(tgzOf(a))) throw conflictErr(a.name, a.version);
      if (cmd.includes(tgzOf(b))) throw conflictErr(b.name, b.version);
      return base(cmd);
    };

    await runExec();

    expect(cmds.some((c) => c.startsWith("git tag -a fynpo-rel-"))).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("skips the tag and exits non-zero on a genuine publish failure", async () => {
    const base = handler;
    handler = (cmd) => {
      if (cmd.includes(tgzOf(b))) throw noRightsErr(b.name);
      return base(cmd);
    };

    await expect(runExec()).rejects.toThrow("process.exit:1");

    expect(cmds.some((c) => c.startsWith("git tag -a"))).toBe(false);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

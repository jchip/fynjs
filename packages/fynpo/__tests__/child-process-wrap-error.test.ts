import { describe, it, expect } from "vitest";
import { exec } from "../src/child-process";

//
// `fynpo run` names the failing package in its summary by reading `result.pkg.name`. That only
// worked on the bail path: wrapError attached `pkg` in a `.catch()`, but `--no-bail` passes
// `reject: false`, which makes execa RESOLVE a failed run rather than throw. The resolved result
// reached the summary with no `pkg` on it, printing `- undefined - exit code 1` (FPO-39).
//
describe("child-process wrapError", () => {
  const pkg = { name: "some-pkg", path: process.cwd() };

  it("annotates a resolved failure with pkg and exit code when reject is false", async () => {
    const result: any = await exec("node", ["-e", "process.exit(3)"], {
      cwd: process.cwd(),
      reject: false,
      pkg,
    } as any);

    expect(result.failed).toBe(true);
    expect(result.exitCode).toBe(3);
    expect(result.pkg).toBe(pkg);
    expect(result.pkg.name).toBe("some-pkg");
  });

  it("still rejects and annotates the error when reject is true", async () => {
    const err: any = await exec("node", ["-e", "process.exit(4)"], {
      cwd: process.cwd(),
      reject: true,
      pkg,
    } as any).then(
      () => undefined,
      (e) => e
    );

    expect(err).toBeDefined();
    expect(err.exitCode).toBe(4);
    expect(err.pkg).toBe(pkg);
  });

  it("leaves a successful run untouched", async () => {
    const result: any = await exec("node", ["-e", "process.stdout.write('ok')"], {
      cwd: process.cwd(),
      reject: false,
      pkg,
    } as any);

    expect(result.failed).toBe(false);
    expect(result.stdout).toBe("ok");
    // nothing to annotate on success - pkg is only attached to failures
    expect(result.pkg).toBeUndefined();
  });

  it("passes through when no pkg is attached to the spawned process", async () => {
    const result: any = await exec("node", ["-e", "process.stdout.write('bare')"], {
      cwd: process.cwd(),
      reject: false,
    } as any);

    expect(result.stdout).toBe("bare");
  });
});

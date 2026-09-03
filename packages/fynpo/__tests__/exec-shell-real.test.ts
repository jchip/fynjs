import { describe, it, expect } from "vitest";
import Path from "path";
import Os from "os";
import Fs from "fs";

import { execShell } from "../src/utils/exec-shell";

describe("execShell (real process)", () => {
  it("runs the command in the requested directory, with PWD matching", async () => {
    const dir = Fs.realpathSync(Os.tmpdir());

    const result: any = await execShell(
      `node -e "console.log(process.cwd()); console.log(process.env.PWD)"`,
      dir
    );

    const [cwd, pwd] = result.stdout.trim().split("\n");
    expect(Path.resolve(cwd)).toBe(dir);
    expect(Path.resolve(pwd)).toBe(dir);
  });
});

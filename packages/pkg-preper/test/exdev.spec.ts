import { describe, it, expect, vi } from "vitest";
import { verify } from "run-verify";
import * as Path from "node:path";
import * as Fs from "node:fs";
import * as Os from "node:os";

// Simulate tmpDir and target on different filesystems.
vi.mock("node:fs/promises", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs/promises")>();
  const rename = async () => {
    throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
  };
  return { ...orig, default: { ...orig, rename }, rename };
});

const { default: PkgPreper } = await import("../src/index.js");

describe("packDirectory across filesystems", () => {
  it("falls back to copy when rename fails with EXDEV", () => {
    const base = Fs.mkdtempSync(Path.join(Os.tmpdir(), "pkg-preper-exdev-"));
    const dir = Path.join(base, "pkg");
    const target = Path.join(base, "out.tgz");

    return verify({
      timeout: 2000,
      cleanup: () => Fs.rmSync(base, { recursive: true, force: true }),
    })
      .step(() => {
        Fs.mkdirSync(dir);
        Fs.writeFileSync(
          Path.join(dir, "package.json"),
          JSON.stringify({ name: "x", version: "1.0.0" }),
        );
      })
      .step(() => {
        const preper = new PkgPreper({
          tmpDir: Path.join(base, "tmp"),
          installDependencies: async () => undefined,
        });
        return preper.packDirectory({}, dir, target);
      })
      .step(() => expect(Fs.statSync(target).size).toBeGreaterThan(0));
  });
});

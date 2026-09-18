import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processInput, processOutput, processLifecycleInput, readHashDigest } from "../src/caching.js";
import npmPacklist from "npm-packlist";
import Path from "node:path";
import { promises as Fs } from "node:fs";
import { createHash } from "node:crypto";

describe("caching", function () {
  describe("fixture inputs and outputs", () => {
    let cwd: string;
    const packageJson = { name: "cache-fixture", scripts: { build: "echo build" } };

    beforeEach(async () => {
      await Fs.mkdir(".temp", { recursive: true });
      cwd = await Fs.mkdtemp(Path.resolve(".temp/cache-input-"));
      await Fs.writeFile(Path.join(cwd, "package.json"), JSON.stringify(packageJson));
      await Fs.writeFile(Path.join(cwd, "artifact.txt"), "first output");
    });

    afterEach(async () => {
      await Fs.rm(cwd, { recursive: true, force: true });
    });

    it.each([true, false])("includes lifecycle scripts (provided manifest: %s)", async (provided) => {
      const result = await processLifecycleInput({
        cwd,
        input: { npmScripts: ["build"], include: ["artifact.txt"] },
        packageJson: provided ? packageJson : undefined,
      });
      expect(result).toMatchObject({
        files: ["artifact.txt"],
        data: { npmScripts: { build: "echo build" } },
        hash: expect.any(String),
      });
    });

    it.each([true, false])("skips missing scripts (provided manifest: %s)", async (provided) => {
      expect(
        await processLifecycleInput({
          cwd,
          input: { npmScripts: ["prepare"] },
          packageJson: provided ? packageJson : undefined,
        })
      ).toEqual({});
    });

    it("hashes output contents and associates them with the input hash", async () => {
      const options = {
        cwd, inputHash: "input-hash", calcHash: true, output: { include: ["*.txt"] },
      };
      const first = await processOutput(options);
      expect(first.files).toEqual(["artifact.txt"]);
      expect(first.data).toEqual({
        inputHash: "input-hash",
        fileHashes: {
          "artifact.txt": createHash("sha256").update("first output").digest("base64url"),
        },
      });
      expect(first.hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(first.access).toBe(first.create);

      await Fs.writeFile(Path.join(cwd, "artifact.txt"), "second output");
      const second = await processOutput(options);
      expect(second.hash).not.toBe(first.hash);
      expect(second.data.fileHashes).not.toEqual(first.data.fileHashes);
    });
  });

  it.each([undefined, "hex", "base64"] as const)("reads a hash digest using %s encoding", (encoding) => {
    const hash = createHash("sha256");
    hash.update("cache input");
    expect(readHashDigest(hash, encoding)).toBe(
      createHash("sha256").update("cache input").digest(encoding || "base64url")
    );
  });

  const getInput = async () => {
    return await processInput({
      cwd: process.cwd(),
      input: {
        npmScripts: ["prepare", "prepublish", "build:release", "build"],
        include: ["**/src/**", "package.json", "**/*test*/**"],
        exclude: [
          "**/?(node_modules|.vscode|.DS_Store|coverage|.nyc_output|.fynpo|.git|.github|.gitignore|docs|docusaurus|packages|tmp|.etmp|samples|dist|dist-*|build)",
          "**/*.?(log|md)",
          "**/*test*/*",
          "**/*.?(test|spec).*",
        ],
        includeEnv: ["NODE_ENV"],
      },
    });
  };

  it("should create input data", async () => {
    const b = Date.now();
    const res = await getInput();
    const e = Date.now();

    const r = Array.from(new Set(res.files.map((f) => f.split("/")[0]))).sort();
    expect(r).toStrictEqual(["package.json", "src"]);

    // console.log(res, "\n", e - b);
  });

  it("should create output files with result from npm pack list", async () => {
    const input = await getInput();
    const b = Date.now();
    const preFiles = await npmPacklist({
      path: process.cwd(),
      package: JSON.parse(await Fs.readFile(Path.join(process.cwd(), "package.json"), "utf8")),
      isProjectRoot: true,
      edgesOut: new Map(),
    } as any);
    const output = await processOutput({
      cwd: process.cwd(),
      inputHash: "deadbeef",
      output: {
        include: [],
        filesFromNpmPack: true,
        exclude: [
          "**/?(node_modules|.vscode|.DS_Store|coverage|.nyc_output|.fynpo|.git|.github|.gitignore|docs|docusaurus|packages|tmp|.etmp|samples)",
          "**/*.?(log|md)",
          "**/*test*/*",
          "**/*.?(test|spec).*",
        ],
      },
      preFiles,
    });
    const e = Date.now();
    // console.log("output", output, "\n", e - b);
    const outputFiles = output.files.reduce((acc: Record<string, string[]>, x: string) => {
      const key = input.data.fileHashes[x] ? "both" : "output";
      (acc[key] = acc[key] || []).push(x);
      return acc;
    }, {});
    // console.log("outputFiles", outputFiles);
  });
});

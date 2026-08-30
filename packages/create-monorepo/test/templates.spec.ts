import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fs from "fs";
import Os from "os";
import Path from "path";

import { copyTemplate } from "../src/utils";

const tmplDir = Path.join(__dirname, "..", "templates");

describe("_npmrc template (FJM-20 regression)", () => {
  const content = Fs.readFileSync(Path.join(tmplDir, "_npmrc"), "utf8");

  // This template is copied verbatim into every scaffolded monorepo, so anything active in it
  // is imposed on the user's new repo.
  it("does not hardcode an internal registry", () => {
    expect(content).not.toMatch(/npme\.walmart\.com/);
  });

  it("does not disable TLS verification", () => {
    // matches only an active setting - a commented example is fine
    expect(content).not.toMatch(/^\s*strict-ssl\s*=\s*false/m);
  });

  it("sets no active registry, so the user's own npm config wins", () => {
    expect(content).not.toMatch(/^\s*registry\s*=/m);
  });

  it("still documents where to pin a registry", () => {
    expect(content).toMatch(/#\s*registry=/);
  });
});

describe("copyTemplate _npmrc -> .npmrc", () => {
  let destDir: string;

  beforeAll(async () => {
    destDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "create-monorepo-tmpl-"));
    await copyTemplate(tmplDir, destDir, { _npmrc: { destName: ".npmrc" } });
  });

  afterAll(() => {
    Fs.rmSync(destDir, { recursive: true, force: true });
  });

  it("writes the template to .npmrc", () => {
    const written = Fs.readFileSync(Path.join(destDir, ".npmrc"), "utf8");
    expect(written).toEqual(Fs.readFileSync(Path.join(tmplDir, "_npmrc"), "utf8"));
  });

  it("carries no active setting into the scaffolded repo", () => {
    const written = Fs.readFileSync(Path.join(destDir, ".npmrc"), "utf8");
    const active = written
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    expect(active).toEqual([]);
  });
});

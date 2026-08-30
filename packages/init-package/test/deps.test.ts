import { describe, it, expect } from "vitest";
import { isBuiltin } from "node:module";
import Fs from "node:fs";
import Path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = Path.join(Path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(Fs.readFileSync(Path.join(pkgDir, "package.json"), "utf8"));

/** strip comments and strings-in-comments so prose about a module can't look like an import */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** "enquirer" -> "enquirer", "lodash/get" -> "lodash", "@scope/a/b" -> "@scope/a" */
function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function runtimeImportsOf(file: string): string[] {
  const code = stripComments(Fs.readFileSync(file, "utf8"));
  const specifiers = new Set<string>();
  const patterns = [
    /(?:^|[\s;}])import\s+(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      specifiers.add(m[1]);
    }
  }
  return [...specifiers]
    .filter(s => !s.startsWith(".") && !s.startsWith("#") && !isBuiltin(s))
    .map(packageNameOf);
}

const srcFiles = Fs.readdirSync(Path.join(pkgDir, "src"))
  .filter(f => f.endsWith(".ts"))
  .map(f => Path.join(pkgDir, "src", f));

describe("init-package runtime dependencies", () => {
  it("finds source files to check", () => {
    expect(srcFiles.length).toBeGreaterThan(0);
  });

  //
  // src/ is what ships in dist/, so every bare specifier it imports must resolve for a
  // consumer that installed only `dependencies`. A devDependency resolves in this monorepo
  // and nowhere else - which is how enquirer stayed broken (FJM-45).
  //
  it("declares every package imported by src/ in dependencies", () => {
    const declared = new Set(Object.keys(pkg.dependencies || {}));
    const missing = new Map<string, string[]>();

    for (const file of srcFiles) {
      for (const name of runtimeImportsOf(file)) {
        if (!declared.has(name)) {
          missing.set(name, [...(missing.get(name) || []), Path.basename(file)]);
        }
      }
    }

    expect(Object.fromEntries(missing)).toEqual({});
  });

  it("keeps enquirer out of devDependencies", () => {
    expect(pkg.dependencies).toHaveProperty("enquirer");
    expect(pkg.devDependencies || {}).not.toHaveProperty("enquirer");
  });
});

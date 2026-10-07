import Fs from "fs";
import Os from "os";
import Path from "path";
import { filterScanDir, filterScanDirSync } from "../../src/index.js";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { verify } from "run-verify";

const apis = [
  { name: "async", scan: (opts) => filterScanDir(opts) },
  { name: "sync", scan: (opts) => filterScanDirSync(opts) },
];

let cwd: string;
let ignoreCwd: string;

// tree: x.js, a/y.ts, a/b/z.js
function makeTree() {
  const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "fsd18-options-"));
  Fs.mkdirSync(Path.join(dir, "a/b"), { recursive: true });
  Fs.writeFileSync(Path.join(dir, "x.js"), "x");
  Fs.writeFileSync(Path.join(dir, "a/y.ts"), "y");
  Fs.writeFileSync(Path.join(dir, "a/b/z.js"), "z");
  return dir;
}

beforeAll(() => {
  cwd = makeTree();
  ignoreCwd = makeTree();
  Fs.writeFileSync(Path.join(ignoreCwd, "a/.gitignore"), JSON.stringify({ "b/z.js": true }));
});

afterAll(() => {
  Fs.rmSync(cwd, { recursive: true, force: true });
  Fs.rmSync(ignoreCwd, { recursive: true, force: true });
});

// canned parser: rules file holds a JSON map of relative path to ignored flag
const parseRules = (contents: string) => {
  const results = JSON.parse(contents) as Record<string, boolean>;
  return { test: (path: string) => ({ ignored: results[path] === true, unignored: false }) };
};

describe("option handling", function () {
  for (const { name, scan } of apis) {
    describe(name, function () {
      for (const fullStat of [true, false]) {
        it(`pathSep only changes output paths, fullStat=${fullStat}`, () => {
          return verify({ timeout: 500 })
            .step(() => scan({ cwd, pathSep: "|", fullStat }))
            .step((files: string[]) => [...files].sort())
            .keep.step((files) => expect(files).toEqual(["a|b|z.js", "a|y.ts", "x.js"]));
        });

        it(`pathSep joins prependCwd output, fullStat=${fullStat}`, () => {
          return verify({ timeout: 500 })
            .step(() => scan({ cwd, pathSep: "|", fullStat, prependCwd: true }))
            .step((files: string[]) => [...files].sort())
            .keep.step((files) =>
              expect(files).toEqual([`${cwd}|a|b|z.js`, `${cwd}|a|y.ts`, `${cwd}|x.js`]),
            );
        });
      }

      it("pathSep keeps filesystem paths for gitignore", () => {
        return verify({ timeout: 500 })
          .step(() => scan({ cwd: ignoreCwd, pathSep: "|", gitignore: parseRules }))
          .step((files: string[]) => [...files].sort())
          .keep.step((files) => expect(files).toEqual(["a|.gitignore", "a|y.ts", "x.js"]));
      });

      it("filter result { group } without grouping keeps the entry", () => {
        return verify({ timeout: 500 })
          .step(() => scan({ cwd, filter: () => ({ group: "g" }) }))
          .step((files: string[]) => [...files].sort())
          .keep.step((files) => expect(files).toEqual(["a/b/z.js", "a/y.ts", "x.js"]));
      });

      it("filterDir result { group } without grouping keeps the dir", () => {
        return verify({ timeout: 500 })
          .step(() => scan({ cwd, includeDir: true, filterDir: () => ({ group: "g" }) }))
          .step((files: string[]) => [...files].sort())
          .keep.step((files) =>
            expect(files).toEqual(["a", "a/b", "a/b/z.js", "a/y.ts", "x.js"]),
          );
      });

      for (const callback of ["filter", "filterDir", "prefilter"]) {
        it(`async ${callback} function is rejected`, () => {
          return verify({ timeout: 500 })
            .expectErrorToBe(TypeError)
            .expectErrorHas(`${callback} must return a result synchronously`)
            .step(() => scan({ cwd, [callback]: async () => false }));
        });
      }
    });
  }
});

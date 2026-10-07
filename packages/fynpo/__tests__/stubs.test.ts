import { describe, expect, it } from "vitest";
import Path from "node:path";
import { createRequire } from "node:module";
import { verify } from "run-verify";

const require = createRequire(import.meta.url);
const stubsDir = Path.resolve(import.meta.dirname, "../stubs");

describe("bundle stubs", () => {
  // rolldown imports CJS in node mode for the .mjs bundle, so the default import is
  // module.exports. A stub that only sets exports.default crashes `fynpo commitlint`.
  it("resolve-extends exports the function as module.exports and default", () =>
    verify()
      .step(() => require(Path.join(stubsDir, "resolve-extends.cjs")))
      .step((mod: any) => {
        expect(typeof mod).toBe("function");
        expect(mod.default).toBe(mod);
      }));
});

import { describe, it, expect, vi } from "vitest";
import { createTsMapper, defaultIsFile } from "../../src/resolver.ts";
import { verify } from "run-verify";

/** Build a mapper whose "filesystem" is just the given set of URLs. */
const withFiles = (...files: string[]) => {
  const set = new Set(files);
  const isFile = vi.fn((url: string) => set.has(url));
  return { map: createTsMapper({ isFile }), isFile };
};

const B = "file:///p/src/";

describe("createTsMapper", () => {
  it("uses the real filesystem by default", () => {
    const map = createTsMapper();
    const source = new URL("../fixtures/esm/lib.ts", import.meta.url).href;
    expect(map(new URL("../fixtures/esm/lib.js", import.meta.url).href)).toBe(source);
  });

  describe("js specifier -> ts source", () => {
    it("maps .js to .ts when only the .ts exists", () => {
      const { map } = withFiles(`${B}a.ts`);
      expect(map(`${B}a.js`)).toBe(`${B}a.ts`);
    });

    it("maps .js to .tsx when that is what exists", () => {
      const { map } = withFiles(`${B}a.tsx`);
      expect(map(`${B}a.js`)).toBe(`${B}a.tsx`);
    });

    it("maps .mjs to .mts", () => {
      const { map } = withFiles(`${B}a.mts`);
      expect(map(`${B}a.mjs`)).toBe(`${B}a.mts`);
    });

    it("maps .cjs to .cts", () => {
      const { map } = withFiles(`${B}a.cts`);
      expect(map(`${B}a.cjs`)).toBe(`${B}a.cts`);
    });

    it("leaves a real .js alone even when a .ts shadows it", () => {
      const { map } = withFiles(`${B}a.js`, `${B}a.ts`);
      expect(map(`${B}a.js`)).toBeNull();
    });

    it("returns null when neither exists", () => {
      const { map } = withFiles();
      expect(map(`${B}a.js`)).toBeNull();
    });
  });

  describe("extensionless specifier", () => {
    it("resolves to a sibling .ts", () => {
      const { map } = withFiles(`${B}a.ts`);
      expect(map(`${B}a`)).toBe(`${B}a.ts`);
    });

    it("falls back to directory index", () => {
      const { map } = withFiles(`${B}a/index.ts`);
      expect(map(`${B}a`)).toBe(`${B}a/index.ts`);
    });

    it("prefers the sibling file over a directory index", () => {
      const { map } = withFiles(`${B}a.ts`, `${B}a/index.ts`);
      expect(map(`${B}a`)).toBe(`${B}a.ts`);
    });

    it("returns null when neither a sibling nor a directory index exists", () => {
      const { map } = withFiles();
      expect(map(`${B}missing`)).toBeNull();
    });
  });

  describe("files it must not touch", () => {
    it("ignores non-js extensions", () => {
      const { map, isFile } = withFiles(`${B}a.ts`);
      expect(map(`${B}a.json`)).toBeNull();
      expect(isFile).not.toHaveBeenCalled();
    });

    it("skips node_modules", () => {
      const { map } = withFiles("file:///p/node_modules/x/a.ts");
      expect(map("file:///p/node_modules/x/a.js")).toBeNull();
    });

    it("skips the fynpo store", () => {
      const { map } = withFiles("file:///p/.fynpo/_store/x/a.ts");
      expect(map("file:///p/.fynpo/_store/x/a.js")).toBeNull();
    });

    it("honours a custom skip pattern", () => {
      const isFile = vi.fn((url: string) => url.endsWith(".ts"));
      const custom = createTsMapper({ isFile, skip: /\/vendor\// });
      expect(custom("file:///p/vendor/a.js")).toBeNull();
      expect(custom(`${B}a.js`)).toBe(`${B}a.ts`);
    });

    describe("with the cwd under a skipped dir", () => {
      const cwd = "/p/.fynpo/proj";
      const files = [`file://${cwd}/src/a.ts`, `file://${cwd}/node_modules/x/a.ts`, "file:///q/node_modules/x/a.ts"];
      const mapUnderCwd = () => {
        vi.spyOn(process, "cwd").mockReturnValue(cwd);
        return withFiles(...files).map;
      };

      it("maps files below the cwd", () => {
        return verify({ timeout: 500, cleanup: () => vi.restoreAllMocks() })
          .step(() => mapUnderCwd())
          .step(map => expect(map(`file://${cwd}/src/a.js`)).toBe(`file://${cwd}/src/a.ts`));
      });

      it("still skips node_modules below the cwd", () => {
        return verify({ timeout: 500, cleanup: () => vi.restoreAllMocks() })
          .step(() => mapUnderCwd())
          .step(map => expect(map(`file://${cwd}/node_modules/x/a.js`)).toBeNull());
      });

      it("handles the filesystem root as the cwd", () => {
        return verify({ timeout: 500, cleanup: () => vi.restoreAllMocks() })
          .step(() => vi.spyOn(process, "cwd").mockReturnValue("/"))
          .step(() => withFiles("file:///src/a.ts", "file:///node_modules/x/a.ts").map)
          .keep.step(map => expect(map("file:///src/a.js")).toBe("file:///src/a.ts"))
          .step(map => expect(map("file:///node_modules/x/a.js")).toBeNull());
      });

      it("tests a url outside the cwd whole", () => {
        return verify({ timeout: 500, cleanup: () => vi.restoreAllMocks() })
          .step(() => mapUnderCwd())
          .step(map => expect(map("file:///q/node_modules/x/a.js")).toBeNull());
      });
    });
  });

  describe("caching", () => {
    it("stats a given url only once", () => {
      const { map, isFile } = withFiles(`${B}a.ts`);
      expect(map(`${B}a.js`)).toBe(`${B}a.ts`);
      const afterFirst = isFile.mock.calls.length;
      expect(map(`${B}a.js`)).toBe(`${B}a.ts`);
      expect(isFile.mock.calls.length).toBe(afterFirst);
    });

    it("does not cache misses, so a file created later is found", () => {
      const set = new Set<string>();
      const map = createTsMapper({ isFile: url => set.has(url) });

      return verify({ timeout: 500 })
        .step(() => expect(map(`${B}a.js`)).toBeNull())
        .step(() => set.add(`${B}a.ts`))
        .step(() => expect(map(`${B}a.js`)).toBe(`${B}a.ts`));
    });
  });
});

describe("defaultIsFile", () => {
  it("is true for a real file", () => {
    expect(defaultIsFile(import.meta.url)).toBe(true);
  });

  it("is false for a directory", () => {
    expect(defaultIsFile(new URL(".", import.meta.url).href)).toBe(false);
  });

  it("is false for a missing path", () => {
    expect(defaultIsFile(new URL("./nope.nope", import.meta.url).href)).toBe(false);
  });
});

describe("trailing-slash directory url", () => {
  it("maps straight to the index with a single slash", () =>
    verify({ timeout: 1000 })
      .step(() => withFiles(`${B}sub/index.ts`, `${B}sub/.ts`))
      .keep.step(({ map }) => expect(map(`${B}sub/`)).toBe(`${B}sub/index.ts`))
      .step(({ isFile }) => expect(isFile).not.toHaveBeenCalledWith(`${B}sub/.ts`)));

  it("returns null when the directory has no index", () =>
    verify({ timeout: 1000 })
      .step(() => withFiles(`${B}sub.ts`))
      .step(({ map }) => expect(map(`${B}sub/`)).toBeNull()));
});

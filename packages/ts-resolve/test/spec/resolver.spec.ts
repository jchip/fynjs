import { describe, it, expect, vi } from "vitest";
import { createTsMapper, defaultIsFile } from "../../src/resolver.ts";

/** Build a mapper whose "filesystem" is just the given set of URLs. */
const withFiles = (...files: string[]) => {
  const set = new Set(files);
  const isFile = vi.fn((url: string) => set.has(url));
  return { map: createTsMapper({ isFile }), isFile };
};

const B = "file:///p/src/";

describe("createTsMapper", () => {
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
  });

  describe("caching", () => {
    it("stats a given url only once", () => {
      const { map, isFile } = withFiles(`${B}a.ts`);
      expect(map(`${B}a.js`)).toBe(`${B}a.ts`);
      const afterFirst = isFile.mock.calls.length;
      expect(map(`${B}a.js`)).toBe(`${B}a.ts`);
      expect(isFile.mock.calls.length).toBe(afterFirst);
    });

    it("caches negative results too", () => {
      const { map, isFile } = withFiles();
      expect(map(`${B}a.js`)).toBeNull();
      const afterFirst = isFile.mock.calls.length;
      expect(map(`${B}a.js`)).toBeNull();
      expect(isFile.mock.calls.length).toBe(afterFirst);
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

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  makeOptionalImport,
  tryImport,
  tryResolve,
  setDefaultLog,
  type ImportMetaLike
} from "../../src/index.ts";

/**
 * vitest's SSR transform does not provide `import.meta.resolve`, so these tests inject the
 * `ImportMetaLike` seam directly. That is also the cleaner unit boundary -- resolution is the
 * dependency, and it is explicit. Real `import.meta` behavior is covered by integration.spec.ts,
 * which runs in an actual node process.
 */

const fixture = (p: string) => new URL(`../fixtures/app/node_modules/${p}`, import.meta.url).href;

const notFoundError = (specifier: string) => {
  const err: NodeJS.ErrnoException = new Error(`Cannot find package '${specifier}'`);
  err.code = "ERR_MODULE_NOT_FOUND";
  return err;
};

const codedError = (code: string) => {
  const err: NodeJS.ErrnoException = new Error(`failing with ${code}`);
  err.code = code;
  return err;
};

/** a meta whose resolve maps known specifiers, and throws ERR_MODULE_NOT_FOUND otherwise */
const metaOf = (map: Record<string, string> = {}, thrown?: Error): ImportMetaLike => ({
  url: "file:///fake/caller.js",
  resolve(specifier: string) {
    if (map[specifier]) {
      return map[specifier];
    }
    throw thrown || notFoundError(specifier);
  }
});

const presentMeta = metaOf({
  "present-esm": fixture("present-esm/index.js"),
  "present-cjs": fixture("present-cjs/index.js"),
  "broken-nested": fixture("broken-nested/index.js"),
  "throws-at-load": fixture("throws-at-load/index.js")
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("makeOptionalImport", () => {
  it("should import a module that is present", async () => {
    const optionalImport = makeOptionalImport(presentMeta);
    const mod = await optionalImport("present-esm");
    expect(mod.kind).toBe("esm");
    expect(mod.default).toBe("present-esm-default");
  });

  it("should return the namespace as-is for CJS, without unwrapping default", async () => {
    const optionalImport = makeOptionalImport(presentMeta);
    const mod = await optionalImport("present-cjs");
    expect(mod.default).toEqual({ kind: "cjs" });
  });

  it("should return undefined when the module is not installed", async () => {
    const optionalImport = makeOptionalImport(metaOf());
    expect(await optionalImport("nope")).toBeUndefined();
  });

  it("should return the default value when the module is not installed", async () => {
    const optionalImport = makeOptionalImport(metaOf());
    expect(await optionalImport("nope", { default: "FALLBACK" })).toBe("FALLBACK");
  });

  it("should reject the caller's import.meta.url instead of import.meta", () => {
    expect(() => makeOptionalImport("file:///x.js" as unknown as ImportMetaLike)).toThrow(
      /import\.meta` object/
    );
    expect(() => makeOptionalImport(undefined as unknown as ImportMetaLike)).toThrow(TypeError);
  });

  it("should expose a synchronous resolve", () => {
    const optionalImport = makeOptionalImport(presentMeta);
    expect(optionalImport.resolve("present-esm")).toBe(fixture("present-esm/index.js"));
    expect(optionalImport.resolve("nope")).toBeUndefined();
    expect(optionalImport.resolve("nope", { default: "X" })).toBe("X");
  });

  it("should expose a synchronous has check", () => {
    const optionalImport = makeOptionalImport(presentMeta);
    expect(optionalImport.has("present-esm")).toBe(true);
    expect(optionalImport.has("nope")).toBe(false);
  });

  it("should use a log function given at creation", async () => {
    const log = vi.fn();
    const optionalImport = makeOptionalImport(metaOf(), log);
    await optionalImport("nope", true);
    expect(log).toHaveBeenCalledWith("optional module not found: nope", "nope");
  });

  it("should allow replacing the log function after creation", async () => {
    const log = vi.fn();
    const optionalImport = makeOptionalImport(metaOf());
    optionalImport.log = log;
    await optionalImport("nope", "chalker:");
    expect(log).toHaveBeenCalledWith("chalker: optional module not found: nope", "nope");
  });
});

describe("not found vs broken install", () => {
  it("should NOT swallow a nested module-not-found as the dep being absent", async () => {
    const optionalImport = makeOptionalImport(presentMeta);
    // broken-nested IS installed; its own dependency is missing. Same ERR_MODULE_NOT_FOUND code
    // as an absent package, so `default` must not be returned here.
    await expect(optionalImport("broken-nested", { default: "FALLBACK" })).rejects.toThrow(
      /a-dep-that-is-not-installed/
    );
  });

  it("should not swallow a module that throws at load", async () => {
    const optionalImport = makeOptionalImport(presentMeta);
    await expect(optionalImport("throws-at-load", { default: "FALLBACK" })).rejects.toThrow(
      /boom at module scope/
    );
  });

  it("should route a broken install to fail, not notFound", async () => {
    const notFound = vi.fn();
    const fail = vi.fn(() => "FAILED");
    const optionalImport = makeOptionalImport(presentMeta);
    expect(await optionalImport("broken-nested", { notFound, fail })).toBe("FAILED");
    expect(notFound).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalled();
  });

  it("should not log the not-found message for a broken install", async () => {
    const log = vi.fn();
    const optionalImport = makeOptionalImport(presentMeta, log);
    await optionalImport("broken-nested", { message: true, fail: () => undefined });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("options", () => {
  it("should call notFound instead of returning default", async () => {
    const notFound = vi.fn(() => "FROM-NOT-FOUND");
    expect(await tryImport(metaOf(), "nope", { notFound, default: "DEFAULT" })).toBe(
      "FROM-NOT-FOUND"
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("should route a non-not-found resolve error to fail", async () => {
    const meta = metaOf({}, codedError("ERR_INVALID_MODULE_SPECIFIER"));
    expect(await tryImport(meta, "bad", { fail: () => "FAILED", default: "DEFAULT" })).toBe(
      "FAILED"
    );
  });

  it("should rethrow a non-not-found resolve error when fail is not given", async () => {
    const meta = metaOf({}, codedError("ERR_INVALID_MODULE_SPECIFIER"));
    await expect(tryImport(meta, "bad", { default: "DEFAULT" })).rejects.toThrow(
      /ERR_INVALID_MODULE_SPECIFIER/
    );
    expect(() => tryResolve(meta, "bad")).toThrow(/ERR_INVALID_MODULE_SPECIFIER/);
  });

  it("should treat not-exported as not found by default", async () => {
    const meta = metaOf({}, codedError("ERR_PACKAGE_PATH_NOT_EXPORTED"));
    expect(await tryImport(meta, "pkg/secret.js", { default: "FALLBACK" })).toBe("FALLBACK");
  });

  it("should treat not-exported as a failure when asked", async () => {
    const meta = metaOf({}, codedError("ERR_PACKAGE_PATH_NOT_EXPORTED"));
    await expect(
      tryImport(meta, "pkg/secret.js", { default: "FALLBACK", notExported: "fail" })
    ).rejects.toThrow(/ERR_PACKAGE_PATH_NOT_EXPORTED/);
  });

  it("should let opts.meta override the bound meta", async () => {
    const optionalImport = makeOptionalImport(metaOf());
    const mod = await optionalImport("present-esm", { meta: presentMeta });
    expect(mod.kind).toBe("esm");
    expect(optionalImport.resolve("present-esm", { meta: presentMeta })).toBe(
      fixture("present-esm/index.js")
    );
  });

  it("should reject an invalid opts.meta", async () => {
    await expect(
      tryImport(presentMeta, "present-esm", { meta: {} as ImportMetaLike })
    ).rejects.toThrow(TypeError);
  });

  it("should prefer opts.log over the bound log", async () => {
    const bound = vi.fn();
    const perCall = vi.fn();
    const optionalImport = makeOptionalImport(metaOf(), bound);
    await optionalImport("nope", { message: true, log: perCall });
    expect(perCall).toHaveBeenCalled();
    expect(bound).not.toHaveBeenCalled();
  });

  it("should not log when no message option is given", async () => {
    const log = vi.fn();
    await tryImport(metaOf(), "nope", { log });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("default log", () => {
  it("should log to console.log by default", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await tryImport(metaOf(), "nope", true);
    expect(spy).toHaveBeenCalledWith("optional module not found: nope");
  });

  it("should allow replacing the default log", async () => {
    const log = vi.fn();
    setDefaultLog(log);
    try {
      await tryImport(metaOf(), "nope", true);
      expect(log).toHaveBeenCalledWith("optional module not found: nope", "nope");
    } finally {
      setDefaultLog((message: string) => console.log(message));
    }
  });
});

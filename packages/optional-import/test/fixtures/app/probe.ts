/**
 * Runs in a REAL node process (vitest's SSR transform removes import.meta.resolve).
 * Prints a JSON report the integration spec asserts on.
 */
import { makeOptionalImport } from "../../../src/index.ts";
import { fileURLToPath } from "node:url";

const optionalImport = makeOptionalImport(import.meta);
const out: Record<string, unknown> = {};

const record = async (name: string, fn: () => unknown) => {
  try {
    out[name] = { ok: await fn() };
  } catch (err: any) {
    out[name] = { threw: { code: err.code, name: err.name, message: String(err.message).split("\n")[0] } };
  }
};

await record("presentEsm", async () => {
  const m = await optionalImport("present-esm");
  return { kind: m.kind, default: m.default };
});

await record("presentCjs", async () => {
  const m = await optionalImport("present-cjs");
  return { namespaceDefault: m.default };
});

await record("missing", async () => await optionalImport("totally-not-installed"));

await record("missingWithDefault", async () =>
  await optionalImport("totally-not-installed", { default: "FELL-BACK" })
);

// the whole point: installed but its own dep is missing -> must NOT look like "not installed"
await record("brokenNested", async () => await optionalImport("broken-nested", { default: "FELL-BACK" }));

await record("throwsAtLoad", async () => await optionalImport("throws-at-load", { default: "FELL-BACK" }));

await record("brokenNestedViaFail", async () =>
  await optionalImport("broken-nested", { fail: (e: Error) => ({ failCalled: (e as any).code }) })
);

await record("notExportedDefault", async () =>
  await optionalImport("root-export-only/secret.js", { default: "FELL-BACK" })
);

await record("notExportedAsFail", async () =>
  await optionalImport("root-export-only/secret.js", { default: "FELL-BACK", notExported: "fail" })
);

// --- path / file: URL specifiers: resolve never fails for these, so absence has to be
// --- detected by an explicit existence check (OPI-2)
const absMissing = fileURLToPath(new URL("./no-such-file.mjs", import.meta.url));

await record("pathMissingWithDefault", async () =>
  await optionalImport(absMissing, { default: "FELL-BACK" })
);

await record("relPathMissingWithDefault", async () =>
  await optionalImport("./no-such-relative.mjs", { default: "FELL-BACK" })
);

await record("fileUrlMissingWithDefault", async () =>
  await optionalImport(new URL("./no-such-file.mjs", import.meta.url).href, { default: "FELL-BACK" })
);

await record("pathPresent", async () => {
  const m = await optionalImport("./local-good.mjs", { default: "FELL-BACK" });
  return { kind: m.kind };
});

// present at that path but its own dep is missing -> still a real failure
await record("pathBroken", async () =>
  await optionalImport("./local-broken.mjs", { default: "FELL-BACK" })
);

await record("pathBrokenViaFail", async () =>
  await optionalImport("./local-broken.mjs", { fail: (e: any) => ({ failCalled: e.code }) })
);

// ESM has no extension probing, so "./local-good" is simply absent
await record("pathNoExtensionProbing", async () =>
  await optionalImport("./local-good", { default: "FELL-BACK" })
);

out.hasMissingPath = optionalImport.has(absMissing);
out.hasPresentPath = optionalImport.has("./local-good.mjs");
out.resolveMissingPath = optionalImport.resolve(absMissing, { default: null });

out.hasPresent = optionalImport.has("present-esm");
out.hasMissing = optionalImport.has("totally-not-installed");
out.resolvePresent = String(optionalImport.resolve("present-esm")).endsWith("present-esm/index.js");
out.resolveMissing = optionalImport.resolve("totally-not-installed", { default: null });

console.log(JSON.stringify(out, null, 2));

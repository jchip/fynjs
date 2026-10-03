// Runs after publish-util-prepack, which saved package.json for publish-util-postpack to restore.
// The published package carries no binary. It depends on the platform packages instead, which
// CI builds and publishes at the same version.
//
// fyn also runs prepack when it links @fynjs/reflink into the workspace, and that link needs the local
// binary. So only strip it under a real `npm pack` or `npm publish`, which set npm_command.
import { readFileSync, writeFileSync } from "node:fs";

if (!["pack", "publish"].includes(process.env.npm_command)) {
  process.exit(0);
}

const { parseTriple } = await import("@napi-rs/cli");

const file = new URL("package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(file, "utf8"));
pkg.files = pkg.files.filter(f => !f.endsWith(".node"));
pkg.optionalDependencies = Object.fromEntries(
  pkg.napi.targets.map(t => [`${pkg.name}-${parseTriple(t).platformArchABI}`, pkg.version])
);
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);

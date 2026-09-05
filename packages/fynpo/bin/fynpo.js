#!/usr/bin/env node

import Path from "node:path";
import { pathToFileURL } from "node:url";

//
// The release bundle is ESM (dist/bundle.mjs) because chalker uses top-level await to optionally
// load ESM-only chalk, and no CJS output format can represent module-scope await.
//
// The package is `type: module`, so this file is ESM too. `src` is not published (files: bin,
// dist, templates), so the TypeScript branch only ever hits in a dev checkout - installed copies
// always fall through to the bundle. src imports carry explicit .ts specifiers, so node's own
// type stripping loads them with no runner.
//
const here = import.meta.dirname;
const importFile = async rel => {
  const mod = await import(pathToFileURL(Path.join(here, rel)).href);
  return mod.default || mod;
};

async function load() {
  try {
    const src = await importFile("../src/index.ts");
    console.log(`
fynpo loaded from typescript source instead of the bundled source
`);
    return src;
  } catch (err) {
    return importFile("../dist/bundle.mjs");
  }
}

async function main() {
  try {
    const mod = await load();
    await mod.fynpoMain();
  } catch (err) {
    console.error("fynpo failed\n\n", (err && err.stack) || err);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node

const Path = require("path");
const { pathToFileURL } = require("url");

//
// The release bundle is ESM (dist/bundle.mjs) because chalker uses top-level await to optionally
// load ESM-only chalk, and no CJS output format can represent module-scope await.
//
// This file stays CJS so package.json can remain type: commonjs. main() was already async, so
// reaching the ESM bundle costs nothing extra.
//
async function load() {
  try {
    const dist = require("../src/index.ts");
    console.log(`
fynpo loaded from typescript source instead of the bundled source
`);
    return dist;
  } catch (err) {
    const url = pathToFileURL(Path.join(__dirname, "../dist/bundle.mjs")).href;
    const mod = await import(url);
    return mod.default || mod;
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

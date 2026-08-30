#!/usr/bin/env node

import Path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

//
// fynpo-cli is a thin global launcher: `npm i -g fynpo-cli` gives you a `fynpo` command that
// finds and runs the fynpo installed in whatever monorepo you are standing in. Hence resolving
// from process.cwd() rather than from this package's own location.
//
const cwdRequire = createRequire(Path.join(process.cwd(), "_"));

const notInMonorepo = (): never => {
  console.error(`ERROR: Unable to find the fynpo module from dir ${process.cwd()}

Please make sure you are in a fynpo monorepo and you have installed fynpo
at its top level.
`);
  return process.exit(1);
};

const failedToLoad = (err: unknown): never => {
  console.error(
    `Fail to load fynpo for your monorepo from dir ${process.cwd()}
`,
    err
  );
  return process.exit(1);
};

//
// Find fynpo's entry through its package.json `bin` field, not a path inside its dist/.
//
// This used to require "fynpo/dist/fynpo-cli". That file stopped existing when fynpo's build
// changed (webpack emitting dist/fynpo-cli -> rolldown emitting only dist/bundle.mjs), so the
// require always missed and every invocation printed "not in a fynpo monorepo" - misleading,
// because fynpo was installed fine. dist/ layout is fynpo's private business; `bin` is the
// published contract, and following it means a future build change cannot break this again.
// See FJM-85.
//
let pkgJsonPath: string;
try {
  pkgJsonPath = cwdRequire.resolve("fynpo/package.json");
} catch {
  pkgJsonPath = notInMonorepo();
}

const pkg = cwdRequire(pkgJsonPath);

const binRel: string =
  (pkg && pkg.bin && (typeof pkg.bin === "string" ? pkg.bin : pkg.bin.fynpo)) || "bin/fynpo.js";

const binPath = Path.join(Path.dirname(pkgJsonPath), binRel);

//
// fynpo's bin runs its own main() on load - it also owns the logic for reaching the ESM bundle
// and for the load-from-TypeScript-source fallback. Importing it hands over completely,
// in-process, so argv and the exit code flow through untouched. Dynamic import loads the bin
// whether it is CJS or ESM.
//
try {
  await import(pathToFileURL(binPath).href);
} catch (err: unknown) {
  const code = (err as NodeJS.ErrnoException)?.code;
  // the bin file itself missing means the fynpo install is broken/absent - same guidance as
  // not finding the package at all; anything else is a real load failure worth showing
  if (code === "ERR_MODULE_NOT_FOUND" && String(err).includes(binRel.replace(/^\.\//, ""))) {
    notInMonorepo();
  } else {
    failedToLoad(err);
  }
}

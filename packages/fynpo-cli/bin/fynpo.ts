#!/usr/bin/env node

import Path from "path";
import { makeOptionalRequire } from "optional-require";

//
// fynpo-cli is a thin global launcher: `npm i -g fynpo-cli` gives you a `fynpo` command that
// finds and runs the fynpo installed in whatever monorepo you are standing in. Hence resolving
// from process.cwd() rather than from this package's own location.
//
const optionalRequire = makeOptionalRequire(process.cwd());

const notInMonorepo = () => {
  console.error(`ERROR: Unable to find the fynpo module from dir ${process.cwd()}

Please make sure you are in a fynpo monorepo and you have installed fynpo
at its top level.
`);
  process.exit(1);
};

const failedToLoad = (err: Error) => {
  console.error(
    `Fail to load fynpo for your monorepo from dir ${process.cwd()}
`,
    err
  );
  process.exit(1);
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
const pkg = optionalRequire("fynpo/package.json", { notFound: notInMonorepo });

const binRel: string =
  (pkg && pkg.bin && (typeof pkg.bin === "string" ? pkg.bin : pkg.bin.fynpo)) || "bin/fynpo.js";

const pkgJsonPath = optionalRequire.resolve("fynpo/package.json", {
  notFound: notInMonorepo
}) as string;

const binPath = Path.join(Path.dirname(pkgJsonPath), binRel);

//
// fynpo's bin is CJS and runs its own main() on load - it also owns the logic for reaching the
// ESM bundle and for the load-from-TypeScript-source fallback. Requiring it hands over
// completely, in-process, so argv and the exit code flow through untouched.
//
optionalRequire(binPath, { notFound: notInMonorepo, fail: failedToLoad });

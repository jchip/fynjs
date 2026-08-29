import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import Path from "node:path";

const require = createRequire(import.meta.url);

//
// The release build deliberately does NOT go through xrun.
//
// The published @xarc/run does `require("chalker")` in its CLI, and chalker is now ESM with top-
// level await, so it cannot load it - which broke the release build, including the nested build
// fynpo runs against its local fyn dependency. The local @fynjs/run fixed that with an async
// chalker loader, but this build stays off the task runner regardless.
//
// These three steps are plain commands with no task-runner semantics, so depending on a task
// runner to sequence them only bought a failure mode. xrun-tasks.ts is still there for dev tasks.
//

const bin = name => Path.resolve("node_modules/.bin", name);

const run = (label, cmd, args) => {
  process.stdout.write(`> ${label}\n`);
  execFileSync(cmd, args, { stdio: "inherit" });
};

run("create-tgz", process.execPath, ["test/fixtures/mock-npm/create-tgz"]);

run("compile-yarn", bin("babel"), ["yarn/src", "--out-dir", "yarn/lib"]);

run("bundle", bin("rolldown"), ["-c", "rolldown.config.mjs"]);

// v8-compile-cache is loaded opportunistically by bin/bundle.js
mkdirSync("dist", { recursive: true });
copyFileSync(require.resolve("v8-compile-cache"), Path.join("dist", "v8-compile-cache.js"));
process.stdout.write("> build complete\n");

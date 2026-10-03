// Build the native module when Rust is installed. Without cargo, skip so the workspace still
// bootstraps, and fyn uses its JS clone path. `--required` fails instead, for publishing.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (spawnSync("cargo", ["--version"], { stdio: "ignore" }).error) {
  if (process.argv.includes("--required")) {
    console.error("@fynjs/reflink: cargo not found, it is required to build for publishing");
    process.exit(1);
  }
  console.log("@fynjs/reflink: cargo not found, skipping native build");
  process.exit(0);
}

const { build } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")).scripts;
const result = spawnSync(build, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);

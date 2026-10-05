import Fs from "node:fs";
import Path from "node:path";
import { fileURLToPath } from "node:url";
import main from "./main";

const { run } = main;

// Run only when started as a script, so importing this never starts an install. vite-node
// (testing/monorepo-test) drops the script from process.argv, so it counts as started.
const script = process.argv[1];
if (
  script &&
  (Fs.realpathSync(script) === Fs.realpathSync(fileURLToPath(import.meta.url)) ||
    Path.basename(script) === "vite-node")
) {
  run();
}

export { run };
export default run;

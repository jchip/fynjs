import VisualLogger from "visual-logger";
import { isCI } from "./is-ci";

export const logger = new VisualLogger();

if (isCI) {
  //
  // stderr, not the logger. The logger writes to stdout, so this diagnostic was prepended to
  // the output of every command run in CI - `fynpo --version` returned "> CI env detected\n2.1.6",
  // which broke anything parsing it. Diagnostics belong on stderr; stdout is the command's
  // answer (FJM-124).
  //
  process.stderr.write("CI env detected\n");
  logger.setItemType("none");
}

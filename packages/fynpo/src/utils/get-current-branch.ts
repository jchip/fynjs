import { logger } from "../logger.ts";
import { execSync } from "../child-process.ts";

export const getCurrentBranch = (opts) => {
  const branch = execSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts);
  logger.info("currentBranch", branch);

  return branch;
};

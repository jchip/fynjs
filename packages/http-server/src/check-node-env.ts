import chalk from "chalk";
import { getDeployment } from "./compose-config.js";

const ALLOWED_NODE_ENV = ["qa", "development", "staging", "production", "test"];

/**
 * Warn if NODE_ENV is set to something this server has no config overlay for.
 *
 * @param deployment - the deployment name to check, defaults to NODE_ENV
 * @returns nothing
 */
export function checkNodeEnv(deployment: string | undefined = getDeployment()): void {
  if (deployment && !ALLOWED_NODE_ENV.includes(deployment)) {
    const msg = `@fynjs/http-server Notice: NODE_ENV (${deployment}) should be empty or one of ${ALLOWED_NODE_ENV}`;
    process.stderr.write(`    ${chalk.inverse.bold.yellow(msg)}\n`);
  }
}

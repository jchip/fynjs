import VisualLogger from "visual-logger";
import { isCI } from "ci-info";

let logger: VisualLogger | null = null;

export function getDefaultLogger(): VisualLogger {
  if (!logger) {
    logger = new VisualLogger();

    if (isCI) {
      logger.info("visual-exec: CI env detected");
      logger.setItemType("none");
    }
  }
  return logger;
}

export default getDefaultLogger;

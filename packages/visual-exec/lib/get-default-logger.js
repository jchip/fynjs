"use strict";

const VisualLogger = require("visual-logger");
const { isCI } = require("ci-info");

let logger;
const getLogger = () => {
  if (!logger) {
    logger = new VisualLogger();

    if (isCI) {
      logger.info("visual-exec: CI env detected");
      logger.setItemType("none");
    }
  }
  return logger;
};

module.exports = getLogger;

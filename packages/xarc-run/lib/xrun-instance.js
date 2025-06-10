"use strict";

const XRun = require("./xrun");
const XReporterConsole = require("../lib/reporters/console");
const XTaskSpec = require("./xtask-spec");

function createXrunInstance() {
  const xrun = new XRun({});
  xrun[Symbol("reporter")] = new XReporterConsole(xrun);

  xrun.load = xrun.load.bind(xrun);
  xrun.run = xrun.run.bind(xrun);
  xrun.asyncRun = xrun.asyncRun.bind(xrun);

  xrun.XClap = XRun;
  xrun.XRun = XRun;
  xrun.XTaskSpec = XTaskSpec;
  xrun.XReporterConsole = XReporterConsole;

  return xrun;
}

const container = {
  createXrunInstance,
  xrun: createXrunInstance(),
  reset: () => {
    return (container.xrun = createXrunInstance());
  }
};

module.exports = container;

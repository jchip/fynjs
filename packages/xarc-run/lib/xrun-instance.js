import XRun from "./xrun.js";
import XReporterConsole from "../lib/reporters/console.js";
import XTaskSpec from "./xtask-spec.js";

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
  _xrun: createXrunInstance(),
  get xrun() {
    return this._xrun || this.reset();
  },
  reset() {
    return (this._xrun = createXrunInstance());
  }
};

export { createXrunInstance };
export default container;

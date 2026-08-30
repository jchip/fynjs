import XReporterConsole from "../../../lib/reporters/console.js";
import XRun from "../../../lib/xrun.js";
import XQItem from "../../../lib/xqitem.js";
import { expect as expect } from "chai";
import chalk from "../../../lib/chalk.js";

describe("XReporterConsole", function() {
  const saveLevel = chalk.level;
  beforeAll(() => (chalk.level = 0));
  afterAll(() => (chalk.level = saveLevel));
  it("should indent by qitem level", () => {
    const xrun = new XRun();
    const reporter = new XReporterConsole(xrun);
    const xqi = new XQItem({ name: "test" });
    expect(reporter._indent(xqi)).to.equal("");
    xqi.level = 1;
    expect(reporter._indent(xqi)).to.equal("-");
    xqi.level = 5;
    expect(reporter._indent(xqi)).to.equal(".....");
    expect(reporter._indent(xqi)).to.equal("-----");
    expect(reporter._indent(xqi)).to.equal(".....");
  });
});

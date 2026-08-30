import print1 from "../fixtures/print1.js";
import chalk from "../../lib/chalk.js";
import xstdout from "xstdout";
import Fs from "fs";
import Path from "path";
import instance from "../../lib/xrun-instance.js";
import { expect as expect } from "chai";

describe("print tasks", function() {
  beforeEach(() => {
    instance.reset();
  });

  it("should print tasks", () => {
    // Force chalk to use colors in test environment
    const originalLevel = chalk.level;
    chalk.level = 3; // Force colors (3 = Truecolor, 16m colors)
    
    const xrun = instance.xrun;
    const intercept = xstdout.intercept(true);
    xrun.load(print1);
    xrun.load("ns1", print1);
    xrun.load("ns2", {});
    xrun.printTasks();
    intercept.restore();
    
    // Restore chalk level
    chalk.level = originalLevel;
    
    const outFile = "test/fixtures/print1.out.txt";
    const out = Fs.readFileSync(Path.resolve(outFile)).toString();
    expect(intercept.stdout.join("").trim()).to.equal(out.trim());
  });
});

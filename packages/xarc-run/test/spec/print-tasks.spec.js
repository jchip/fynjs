"use strict";

const print1 = require("../fixtures/print1");
const xstdout = require("xstdout");
const Fs = require("fs");
const Path = require("path");
const instance = require("../../lib/xrun-instance");
const expect = require("chai").expect;

describe("print tasks", function() {
  beforeEach(() => {
    instance.reset();
  });

  it("should print tasks", () => {
    const chalk = require("chalk");
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

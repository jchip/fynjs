"use strict";

const VisualExec = require("../lib/visual-exec");
const Path = require("path");

const ve = new VisualExec({
  title: "test visual exec",
  command: process.execPath + " " + Path.join(__dirname, "test-cmd.js"),
  outputLevel: "info"
});

ve.execute();

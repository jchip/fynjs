"use strict";

/** @type {WrapProcess} */
const WrapProcess = {
  _process: process,
  exit(code) {
    this._process.exit(code);
  },
  cwd() {
    return this._process.cwd();
  },
  chdir(dir) {
    this._process.chdir(dir);
  },
  get argv() {
    return this._process.argv;
  },
  set argv(value) {
    this._process.argv = value;
  },
  get env() {
    return this._process.env;
  },
  set env(value) {
    this._process.env = value;
  }
};

module.exports = WrapProcess;

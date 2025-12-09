"use strict";

/* eslint-disable no-magic-numbers,no-eval,prefer-template */

const xsh = require("xsh");
const chalk = require("chalk");
const getDefaultLogger = require("./get-default-logger");
const VisualLogger = require("visual-logger");
const hasAnsi = require("has-ansi");
const stripAnsi = require("strip-ansi");

xsh.Promise = Promise;

const ONE_MB = 1024 * 1024;
const TEN_MB = 10 * ONE_MB;

class VisualExec {
  constructor({
    command,
    cwd = process.cwd(),
    visualLogger,
    spinner = VisualLogger.spinners[1],
    displayTitle = undefined,
    logLabel = undefined,
    outputLabel = undefined,
    outputLevel = "verbose",
    maxBuffer = TEN_MB,
    forceStderr = true,
    checkStdoutError = true
  }) {
    this._title = displayTitle || this._makeTitle(command);
    this._logLabel = logLabel || this._title;
    this._outputLabel = outputLabel || this._title;
    this._command = command;
    this._cwd = cwd || process.cwd();
    this._logger = visualLogger || getDefaultLogger();
    this._outputLevel = outputLevel;
    this._spinner = spinner;
    this._maxBuffer = maxBuffer;
    this._forceStderr = forceStderr;
    this._checkStdoutError =
      checkStdoutError === true
        ? /error|warn|fatal|unhandled|reject|exception|failure|fail|failed/i
        : checkStdoutError;
    this._startTime = Date.now();
  }

  _makeTitle(command) {
    if (typeof command !== "string") {
      command = "user command";
    }

    return `Running ${command}`;
  }

  /* eslint-disable max-statements */
  _updateDigest(item, buf) {
    const newBuf = item.buf + buf;

    const lines = newBuf
      .split("\n")
      .map(x => x && x.trim())
      .filter(x => x);

    const stripLines = lines.map(x => (hasAnsi(x) ? stripAnsi(x) : x));

    let length = 0;

    // gather as many lines from the end as possible that will fit in a single line, using
    // strings without ansi code to get real length
    let ix = stripLines.length - 1;
    for (; ix >= 0; ix--) {
      const line = stripLines[ix];
      if (line) {
        if (length + line.length < 100) {
          length += line.length;
        } else {
          break;
        }
      }
    }

    let msgs = ix >= 0 ? lines.slice(ix + 1) : lines;
    if (msgs.length === 0) {
      // even the last line is too long, save it, and display last line as is
      item.buf = lines[lines.length - 1] || "";
      // set some reasonable limit to avoid visual digest getting clobberred
      if (item.buf.length > 120) {
        // truncte stripped line only to avoid breaking ansi code
        item.buf = stripLines[stripLines.length - 1].substr(0, 100);
      }
      msgs = [item.buf];
    } else {
      item.buf = msgs.join("\n");
    }

    if (buf.endsWith("\n")) {
      item.buf += "\n";
    }

    this._logger.updateItem(item.name, {
      msg: msgs.join(chalk.blue.inverse("\\n")),
      _save: false,
      _render: false
    });
  }

  show(child) {
    this._stdoutKey = Symbol("visual-exec-stdout");
    this._stderrKey = Symbol("visual-exec-stderr");

    this._logger.addItem({
      name: this._stdoutKey,
      color: "green",
      display: `=== ${this._title}\nstdout`,
      spinner: this._spinner
    });

    this._logger.addItem({
      name: this._stderrKey,
      color: "red",
      display: `stderr`
    });

    const stdoutDigest = { name: this._stdoutKey, buf: "" };
    const stderrDigest = { name: this._stderrKey, buf: "" };
    this._updateStdout = buf => this._updateDigest(stdoutDigest, buf);
    this._updateStderr = buf => this._updateDigest(stderrDigest, buf);

    child.stdout.on("data", this._updateStdout);
    child.stderr.on("data", this._updateStderr);

    this._child = child;

    return child.promise
      .catch(err => {
        this.logResult(err);
        throw err;
      })
      .then(output => {
        this.logResult(null, output);
        return output;
      });
  }

  logResult(err, output) {
    const child = this._child;

    this._logger.removeItem(this._stdoutKey);
    this._logger.removeItem(this._stderrKey);
    child.stdout.removeListener("data", this._updateStdout);
    child.stderr.removeListener("data", this._updateStderr);

    if (err) {
      this._logger.error(`${chalk.red("Failed")} ${this._logLabel} - ${chalk.red(err.message)}`);
      output = err.output;
    } else {
      const time = ((Date.now() - this._startTime) / 1000).toFixed(2);
      const dispTime = `${chalk.magenta(time)}secs`;
      this._logger.info(`Done ${this._logLabel} ${dispTime} ${chalk.green("exit code 0")}`);
    }

    this.logFinalOutput(err, output);
  }

  checkForErrors(text) {
    return this._checkStdoutError && text && text.match(this._checkStdoutError);
  }

  logFinalOutput(err, output) {
    const level =
      err || (this._forceStderr && output.stderr) || this.checkForErrors(output.stdout)
        ? "error"
        : this._outputLevel;

    if (!output || (!output.stdout && !output.stderr)) {
      this._logger[level](`${chalk.green("No output")} from ${this._outputLabel}`);
      return;
    }

    const colorize = t => t.replace(/ERR!/g, chalk.red("ERR!"));

    const logs = [chalk.green(">>>"), `Start of output from ${this._outputLabel} ===`];

    if (output.stdout) {
      logs.push(`\n${colorize(output.stdout)}`);
    }

    if (output.stderr) {
      logs.push(chalk.red("\n=== stderr ===\n") + colorize(output.stderr));
    }

    logs.push(chalk.blue("\n<<<"), `End of output from ${this._outputLabel} ---`);
    this._logger.prefix(false)[level](...logs);
  }

  execute(command) {
    this._startTime = Date.now();
    const child = xsh.exec(
      {
        silent: true,
        cwd: this._cwd,
        env: Object.assign({}, process.env, { PWD: this._cwd }),
        maxBuffer: this._maxBuffer
      },
      command || this._command
    );

    return this.show(child);
  }
}

module.exports = VisualExec;

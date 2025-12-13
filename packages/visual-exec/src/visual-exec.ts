import xsh from "xsh";
import chalk from "chalk";
import { getDefaultLogger } from "./get-default-logger";
import VisualLogger from "visual-logger";
import hasAnsi from "has-ansi";
import stripAnsi from "strip-ansi";

// Set xsh to use native Promise
(xsh as any).Promise = Promise;

const ONE_MB = 1024 * 1024;
const TEN_MB = 10 * ONE_MB;

export interface VisualExecOptions {
  /** The command to execute */
  command: string;
  /** Working directory for the command */
  cwd?: string;
  /** Visual logger instance to use */
  visualLogger?: VisualLogger;
  /** Spinner style to use */
  spinner?: any;
  /** Title displayed during execution */
  displayTitle?: string;
  /** Label used in log messages */
  logLabel?: string;
  /** Label used in output messages */
  outputLabel?: string;
  /** Log level for output (default: "verbose") */
  outputLevel?: string;
  /** Maximum buffer size for stdout/stderr (default: 10MB) */
  maxBuffer?: number;
  /** Force stderr output to be logged as error (default: true) */
  forceStderr?: boolean;
  /** Regex or boolean to check stdout for error patterns (default: true) */
  checkStdoutError?: boolean | RegExp;
}

interface DigestItem {
  name: symbol;
  buf: string;
}

interface ExecOutput {
  stdout: string;
  stderr: string;
}

interface ExecError extends Error {
  output?: ExecOutput;
}

interface ChildProcess {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  promise: Promise<ExecOutput>;
}

export class VisualExec {
  private _title: string;
  private _logLabel: string;
  private _outputLabel: string;
  private _command: string;
  private _cwd: string;
  private _logger: VisualLogger;
  private _outputLevel: string;
  private _spinner: any;
  private _maxBuffer: number;
  private _forceStderr: boolean;
  private _checkStdoutError: boolean | RegExp;
  private _startTime: number;
  private _stdoutKey?: symbol;
  private _stderrKey?: symbol;
  private _updateStdout?: (buf: string) => void;
  private _updateStderr?: (buf: string) => void;
  private _child?: ChildProcess;

  constructor(options: VisualExecOptions) {
    const {
      command,
      cwd = process.cwd(),
      visualLogger,
      spinner = VisualLogger.spinners[1],
      displayTitle,
      logLabel,
      outputLabel,
      outputLevel = "verbose",
      maxBuffer = TEN_MB,
      forceStderr = true,
      checkStdoutError = true
    } = options;

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

  private _makeTitle(command: string): string {
    if (typeof command !== "string") {
      command = "user command";
    }
    return `Running ${command}`;
  }

  private _updateDigest(item: DigestItem, buf: string): void {
    const newBuf = item.buf + buf;

    const lines = newBuf
      .split("\n")
      .map(x => x && x.trim())
      .filter(x => x) as string[];

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
        // truncate stripped line only to avoid breaking ansi code
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

  show(child: ChildProcess): Promise<ExecOutput> {
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

    const stdoutDigest: DigestItem = { name: this._stdoutKey, buf: "" };
    const stderrDigest: DigestItem = { name: this._stderrKey, buf: "" };
    this._updateStdout = (buf: string) => this._updateDigest(stdoutDigest, buf);
    this._updateStderr = (buf: string) => this._updateDigest(stderrDigest, buf);

    child.stdout.on("data", this._updateStdout);
    child.stderr.on("data", this._updateStderr);

    this._child = child;

    return child.promise
      .catch((err: ExecError) => {
        this.logResult(err);
        throw err;
      })
      .then((output: ExecOutput) => {
        this.logResult(null, output);
        return output;
      });
  }

  logResult(err: ExecError | null, output?: ExecOutput): void {
    const child = this._child!;

    this._logger.removeItem(this._stdoutKey!);
    this._logger.removeItem(this._stderrKey!);
    child.stdout.removeListener("data", this._updateStdout!);
    child.stderr.removeListener("data", this._updateStderr!);

    if (err) {
      this._logger.error(`${chalk.red("Failed")} ${this._logLabel} - ${chalk.red(err.message)}`);
      output = err.output;
    } else {
      const time = ((Date.now() - this._startTime) / 1000).toFixed(2);
      const dispTime = `${chalk.magenta(time)}secs`;
      this._logger.info(`Done ${this._logLabel} ${dispTime} ${chalk.green("exit code 0")}`);
    }

    this.logFinalOutput(err, output!);
  }

  checkForErrors(text: string): RegExpMatchArray | null {
    if (!this._checkStdoutError || !text) return null;
    if (this._checkStdoutError instanceof RegExp) {
      return text.match(this._checkStdoutError);
    }
    return null;
  }

  /**
   * Log the final output. Can be overridden to customize output handling.
   * Set to a no-op function to suppress output logging.
   */
  logFinalOutput(err: ExecError | null, output: ExecOutput): void {
    const level =
      err || (this._forceStderr && output?.stderr) || this.checkForErrors(output?.stdout || "")
        ? "error"
        : this._outputLevel;

    if (!output || (!output.stdout && !output.stderr)) {
      (this._logger as any)[level](`${chalk.green("No output")} from ${this._outputLabel}`);
      return;
    }

    const colorize = (t: string) => t.replace(/ERR!/g, chalk.red("ERR!"));

    const logs: string[] = [chalk.green(">>>"), `Start of output from ${this._outputLabel} ===`];

    if (output.stdout) {
      logs.push(`\n${colorize(output.stdout)}`);
    }

    if (output.stderr) {
      logs.push(chalk.red("\n=== stderr ===\n") + colorize(output.stderr));
    }

    logs.push(chalk.blue("\n<<<"), `End of output from ${this._outputLabel} ---`);
    (this._logger.prefix(false) as any)[level](...logs);
  }

  execute(command?: string): Promise<ExecOutput> {
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

    return this.show(child as unknown as ChildProcess);
  }
}

export default VisualExec;

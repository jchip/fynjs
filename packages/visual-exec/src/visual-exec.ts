import xsh from "xsh";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { getDefaultLogger } from "./get-default-logger.ts";
import VisualLogger from "visual-logger";
import hasAnsi from "has-ansi";
import stripAnsi from "strip-ansi";

// Set xsh to use native Promise
(xsh as any).Promise = Promise;

const ONE_MB = 1024 * 1024;
const TEN_MB = 10 * ONE_MB;
const DEFAULT_TIMEOUT_GRACE = 5000;
const DEFAULT_LAST_LINES = 10;
const MAX_OUTPUT_IN_ERROR = 50000;

export type OutputStream = "stdout" | "stderr";

/** Called on each chunk of stdout/stderr during execution */
export type OnOutputCallback = (data: string, stream: OutputStream) => void;

/** Called after command completes. Can return structured result passed through to execute() */
export type OnCompleteCallback = (output: ExecOutput, exitCode: number) => unknown;

export interface OutputFileOptions {
  /** Append to existing file (default: false) */
  append?: boolean;
  /** Include stderr in output (default: true) */
  includeStderr?: boolean;
  /** Add timestamps per line (default: false) */
  timestamps?: boolean;
}

export interface ProgressExtractor {
  /** Regex with named groups: (?<current>\d+)/(?<total>\d+) or (?<percent>\d+)% */
  pattern?: RegExp;
  /** Custom extractor function */
  extract?: (line: string) => { current?: number; total?: number; percent?: number } | null;
  /** Display format for progress */
  format?: (p: { current?: number; total?: number; percent?: number }) => string;
}

export interface OutputMatcher {
  pattern: RegExp;
  onMatch: (match: RegExpMatchArray) => void;
}

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
  /** Timeout in milliseconds. Process killed if exceeded. */
  timeout?: number;
  /** Grace period in ms before SIGKILL after SIGTERM (default: 5000) */
  timeoutGrace?: number;
  /** Callback before killing on timeout */
  onTimeout?: () => void;
  /** Called on each chunk of stdout/stderr during execution */
  onOutput?: OnOutputCallback;
  /** Called after command completes. Return value passed through to execute() when exitCode is 0 */
  onComplete?: OnCompleteCallback;
  /** Stream output to file (path or stream) */
  outputFile?: string | NodeJS.WritableStream;
  /** Options for outputFile when path string */
  outputFileOptions?: OutputFileOptions;
  /** AbortSignal for cancellation (e.g. from AbortController) */
  signal?: AbortSignal;
  /** Progress extraction config */
  progress?: ProgressExtractor;
  /** Called when progress is extracted */
  onProgress?: (progress: { current?: number; total?: number; percent?: number }) => void;
  /** Regex matchers for output lines */
  matchers?: OutputMatcher[];
}

interface DigestItem {
  name: symbol;
  buf: string;
}

export interface ExecOutput {
  stdout: string;
  stderr: string;
}

export interface ExecErrorContext {
  exitCode: number;
  signal: string | null;
  cwd: string;
  command: string;
  duration: number;
  lastLines: string[];
  stdout: string;
  stderr: string;
}

export interface VisualExecError extends Error {
  output?: ExecOutput;
  code?: number;
  exitCode?: number;
  signal?: string | null;
  cwd?: string;
  command?: string;
  duration?: number;
  lastLines?: string[];
  stdout?: string;
  stderr?: string;
  context?: ExecErrorContext;
}

interface ChildProcess {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  promise: Promise<ExecOutput>;
  child?: { kill(signal?: string): boolean; pid?: number };
}

function createTimeoutError(
  context: Partial<ExecErrorContext>,
  elapsed: number
): VisualExecError {
  const err = new Error(
    `Command timed out after ${elapsed}ms: ${context.command}`
  ) as VisualExecError;
  err.name = "TimeoutError";
  err.context = { ...context, duration: elapsed } as ExecErrorContext;
  return err;
}

function createAbortError(context: Partial<ExecErrorContext>): VisualExecError {
  const err = new Error(`Command aborted: ${context.command}`) as VisualExecError;
  err.name = "AbortError";
  err.context = context as ExecErrorContext;
  return err;
}

function lastLines(text: string, n: number): string[] {
  if (!text) return [];
  const lines = text.split("\n").filter(Boolean);
  return lines.slice(-n);
}

function enhanceError(err: VisualExecError, context: ExecErrorContext): VisualExecError {
  err.exitCode = context.exitCode;
  err.signal = context.signal;
  err.cwd = context.cwd;
  err.command = context.command;
  err.duration = context.duration;
  err.lastLines = context.lastLines;
  err.context = context;
  err.stdout = context.stdout.length > MAX_OUTPUT_IN_ERROR
    ? context.stdout.slice(-MAX_OUTPUT_IN_ERROR)
    : context.stdout;
  err.stderr = context.stderr.length > MAX_OUTPUT_IN_ERROR
    ? context.stderr.slice(-MAX_OUTPUT_IN_ERROR)
    : context.stderr;
  return err;
}

/** JSON Lines parser - parses each line as JSON */
export function jsonLinesParser(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Key-value parser for key=value or key: value patterns */
export function keyValueParser(line: string): Record<string, string> | null {
  const match = line.match(/^([^=:]+)[=:]\s*(.*)$/);
  if (!match) return null;
  return { [match[1].trim()]: match[2].trim() };
}

export const parsers = {
  jsonLines: jsonLinesParser,
  keyValue: keyValueParser
};

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
  private _timeout?: number;
  private _timeoutGrace: number;
  private _onTimeout?: () => void;
  private _onOutput?: OnOutputCallback;
  private _onComplete?: OnCompleteCallback;
  private _outputFile?: string | NodeJS.WritableStream;
  private _outputFileOptions: OutputFileOptions;
  private _signal?: AbortSignal;
  private _progress?: ProgressExtractor;
  private _onProgress?: (progress: { current?: number; total?: number; percent?: number }) => void;
  private _matchers?: OutputMatcher[];
  private _stdoutKey?: symbol;
  private _stderrKey?: symbol;
  private _updateStdout?: (buf: string) => void;
  private _updateStderr?: (buf: string) => void;
  private _child?: ChildProcess;
  private _rawChild?: { kill(signal?: string): boolean; pid?: number };
  private _outputStream?: fs.WriteStream;
  private _aborted = false;
  private _onStdoutData?: (buf: Buffer | string) => void;
  private _onStderrData?: (buf: Buffer | string) => void;

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
      checkStdoutError = true,
      timeout,
      timeoutGrace = DEFAULT_TIMEOUT_GRACE,
      onTimeout,
      onOutput,
      onComplete,
      outputFile,
      outputFileOptions = {},
      signal,
      progress,
      onProgress,
      matchers
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
    this._timeout = timeout;
    this._timeoutGrace = timeoutGrace;
    this._onTimeout = onTimeout;
    this._onOutput = onOutput;
    this._onComplete = onComplete;
    this._outputFile = outputFile;
    this._outputFileOptions = {
      append: false,
      includeStderr: true,
      timestamps: false,
      ...outputFileOptions
    };
    this._signal = signal;
    this._progress = progress;
    this._onProgress = onProgress;
    this._matchers = matchers;
  }

  private _makeTitle(command: string): string {
    if (typeof command !== "string") {
      command = "user command";
    }
    return `Running ${command}`;
  }

  private _createOutputFileStream(): fs.WriteStream | undefined {
    if (typeof this._outputFile !== "string") return undefined;
    const flags = this._outputFileOptions.append ? "a" : "w";
    const dir = path.dirname(this._outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return fs.createWriteStream(this._outputFile, { flags });
  }

  private _writeToOutputFile(data: string, stream: OutputStream): void {
    const streamOpt = this._outputFileOptions.includeStderr;
    if (stream === "stderr" && !streamOpt) return;
    const line = this._outputFileOptions.timestamps
      ? `[${new Date().toISOString()}] ${data}`
      : data;
    const out = this._outputStream ?? (typeof this._outputFile === "object" ? this._outputFile : null);
    if (out && typeof (out as any).write === "function") {
      (out as NodeJS.WritableStream).write(line);
    }
  }

  private _extractProgress(line: string): void {
    const cfg = this._progress;
    if (!cfg || !this._onProgress) return;
    let progress: { current?: number; total?: number; percent?: number } | null = null;
    if (cfg.extract) {
      progress = cfg.extract(line);
    } else if (cfg.pattern) {
      const m = line.match(cfg.pattern);
      if (m && m.groups) {
        progress = {
          current: m.groups.current ? parseInt(m.groups.current, 10) : undefined,
          total: m.groups.total ? parseInt(m.groups.total, 10) : undefined,
          percent: m.groups.percent ? parseInt(m.groups.percent, 10) : undefined
        };
      }
    }
    if (progress) this._onProgress(progress);
  }

  private _updateDigest(item: DigestItem, buf: string): void {
    const newBuf = item.buf + buf;

    const lines = newBuf
      .split("\n")
      .map(x => x && x.trim())
      .filter(x => x) as string[];

    const stripLines = lines.map(x => (hasAnsi(x) ? stripAnsi(x) : x));

    let length = 0;

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
      item.buf = lines[lines.length - 1] || "";
      if (item.buf.length > 120) {
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

  private _createDataHandler(stream: OutputStream): (buf: Buffer | string) => void {
    return (buf: Buffer | string) => {
      const data = typeof buf === "string" ? buf : buf.toString();
      if (this._onOutput) this._onOutput(data, stream);
      if (this._outputFile || this._outputStream) this._writeToOutputFile(data, stream);
      for (const line of data.split("\n")) {
        if (line) {
          this._extractProgress(line);
          for (const m of this._matchers ?? []) {
            const match = line.match(m.pattern);
            if (match) m.onMatch(match);
          }
        }
      }
    };
  }

  /** Abort/kill the running command */
  abort(signal: string = "SIGTERM"): void {
    this._aborted = true;
    if (this._rawChild?.pid) {
      this._rawChild.kill(signal);
    }
  }

  /** Alias for abort() */
  kill(signal?: string): void {
    this.abort(signal);
  }

  show(child: ChildProcess): Promise<ExecOutput | unknown> {
    this._stdoutKey = Symbol("visual-exec-stdout");
    this._stderrKey = Symbol("visual-exec-stderr");
    this._rawChild = child.child;

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

    this._onStdoutData = (buf: Buffer | string) => {
      const data = typeof buf === "string" ? buf : buf.toString();
      this._updateStdout!(data);
      this._createDataHandler("stdout")(buf);
    };
    this._onStderrData = (buf: Buffer | string) => {
      const data = typeof buf === "string" ? buf : buf.toString();
      this._updateStderr!(data);
      this._createDataHandler("stderr")(buf);
    };

    child.stdout.on("data", this._onStdoutData);
    child.stderr.on("data", this._onStderrData);

    this._child = child;

    if (typeof this._outputFile === "string") {
      this._outputStream = this._createOutputFileStream();
    } else if (this._outputFile) {
      this._outputStream = undefined;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const startTime = Date.now();
    let execPromise: Promise<ExecOutput | unknown> = child.promise
      .catch((err: VisualExecError) => {
        const output = err.output ?? { stdout: "", stderr: "" };
        const exitCode = err.exitCode ?? err.code ?? 1;
        this._onComplete?.(output, exitCode);
        this.logResult(err);
        throw err;
      })
      .then((output: ExecOutput) => {
        this.logResult(null, output);
        const result = this._onComplete?.(output, 0);
        return result !== undefined ? result : output;
      });

    if (this._timeout) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          if (this._aborted) return;
          this._onTimeout?.();
          if (this._rawChild?.pid) {
            this._rawChild.kill("SIGTERM");
            const grace = setTimeout(() => {
              if (this._rawChild?.pid) this._rawChild.kill("SIGKILL");
            }, this._timeoutGrace);
            (grace as any).unref?.();
          }
          reject(
            createTimeoutError(
              { command: this._command, cwd: this._cwd, exitCode: -1, signal: "SIGTERM" },
              this._timeout
            )
          );
        }, this._timeout);
      });
      execPromise = Promise.race([execPromise, timeoutPromise]);
    }

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      this._outputStream?.end?.();
      this._outputStream = undefined;
    };

    if (this._signal) {
      const abortPromise = new Promise<never>((_, reject) => {
        const handleAbort = () => {
          this.abort();
          reject(
            createAbortError({
              command: this._command,
              cwd: this._cwd,
              exitCode: -1,
              signal: "SIGTERM",
              duration: Date.now() - startTime
            })
          );
        };
        if (this._signal!.aborted) {
          handleAbort();
        } else {
          this._signal!.addEventListener("abort", handleAbort);
        }
      });
      execPromise = Promise.race([execPromise, abortPromise]);
    }

    return execPromise.finally(cleanup);
  }

  logResult(err: VisualExecError | null, output?: ExecOutput): void {
    const child = this._child!;

    this._logger.removeItem(this._stdoutKey!);
    this._logger.removeItem(this._stderrKey!);
    if (this._onStdoutData) child.stdout.removeListener("data", this._onStdoutData);
    if (this._onStderrData) child.stderr.removeListener("data", this._onStderrData);

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
  logFinalOutput(err: VisualExecError | null, output: ExecOutput): void {
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

  execute(command?: string): Promise<ExecOutput | unknown> {
    this._startTime = Date.now();
    this._aborted = false;

    const cmd = command || this._command;
    const result = xsh.exec(
      {
        silent: true,
        cwd: this._cwd,
        env: Object.assign({}, process.env, { PWD: this._cwd }),
        maxBuffer: this._maxBuffer
      },
      cmd
    ) as any;

    const child: ChildProcess = {
      stdout: result.stdout,
      stderr: result.stderr,
      promise: result.promise,
      child: result.child
    };

    const duration = () => Date.now() - this._startTime;
    const baseContext = (output?: ExecOutput): Partial<ExecErrorContext> => ({
      command: cmd,
      cwd: this._cwd,
      duration: duration(),
      stdout: output?.stdout ?? "",
      stderr: output?.stderr ?? "",
      lastLines: lastLines(
        [...(output?.stdout ?? "").split("\n"), ...(output?.stderr ?? "").split("\n")].join("\n"),
        DEFAULT_LAST_LINES
      )
    });

    child.promise = child.promise.catch((err: VisualExecError) => {
      const output = err.output ?? { stdout: "", stderr: "" };
      const exitCode = err.code ?? 1;
      const signal = err.signal ?? (result.child?.killed ? "SIGTERM" : null) ?? null;
      const context: ExecErrorContext = {
        ...baseContext(output),
        exitCode,
        signal,
        cwd: this._cwd,
        command: cmd,
        duration: duration(),
        lastLines: lastLines(
          [...output.stdout.split("\n"), ...output.stderr.split("\n")].join("\n"),
          DEFAULT_LAST_LINES
        ),
        stdout: output.stdout,
        stderr: output.stderr
      };
      return Promise.reject(enhanceError(err, context));
    });

    return this.show(child);
  }
}

export default VisualExec;

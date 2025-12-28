import * as util from "util";
import chalk from "chalk";
import { defaultOutput, OutputInterface } from "./default-output.ts";

export const Levels = {
  debug: 10,
  verbose: 20,
  info: 30,
  warn: 40,
  error: 50,
  fyi: 60,
  none: 100
} as const;

export type LogLevel = keyof typeof Levels;

export const LevelColors: Record<LogLevel, string> = {
  debug: "blue",
  verbose: "cyan",
  info: "",
  warn: "yellow",
  error: "red",
  fyi: "magenta",
  none: ""
};

export const LogItemTypes = {
  normal: 9,
  simple: 1,
  none: 0
} as const;

export type LogItemType = keyof typeof LogItemTypes;

const DEFAULT_SPINNER_INTERVAL = 100;

const SPIN_OFF = 0;
const SPIN_STARTED = 1;
const SPIN_RUNNING = 2;

type SpinState = typeof SPIN_OFF | typeof SPIN_STARTED | typeof SPIN_RUNNING;

export interface ItemOptions {
  name: string | symbol;
  color?: string;
  display?: string;
  spinner?: string | boolean | number;
  spinInterval?: number;
  save?: boolean;
  _display?: string;
  _msg?: string;
  _spinning?: SpinState;
  spinIx?: number;
}

export interface UpdateData {
  msg?: string;
  display?: string;
  _save?: boolean;
  _render?: boolean;
}

export interface VisualLoggerOptions {
  renderFps?: number;
  output?: OutputInterface;
  maxDots?: number;
  updatesPerDot?: number;
  color?: boolean;
  saveLogs?: boolean;
}

interface SpinTimer {
  spinInterval: number;
  timer?: ReturnType<typeof setInterval>;
}

export class VisualLogger {
  private _options: VisualLoggerOptions;
  private _items: (string | symbol)[];
  private _itemOptions: Record<string | symbol, ItemOptions>;
  private _lines: string[];
  private _logLevel: number;
  private _itemType: number;
  private _logData: string[];
  private _output: OutputInterface;
  private _maxDots: number;
  private _updatesPerDot: number;
  private _dotUpdates: number;
  private _color: boolean;
  private _renderInterval: number;
  private _spinTimers: Record<number, SpinTimer>;
  private _renderTimer: ReturnType<typeof setTimeout> | null;
  private _colorPrefix: Record<string, string>;
  private _defaultPrefix: string;
  private _chalkLevel: number;
  private _prefix: string | undefined;
  private _dots: number;
  private _backupItemType: number | undefined;

  constructor(options: VisualLoggerOptions = {}) {
    options = { renderFps: 30, ...options };
    this._options = options;
    this._items = [];
    this._itemOptions = {};
    this._lines = [];
    this._logLevel = Levels.info;
    this._itemType = LogItemTypes.normal;
    this._logData = [];
    this._output = options.output || defaultOutput;
    this._maxDots = options.maxDots !== undefined ? options.maxDots : 80;
    this._updatesPerDot = Number.isFinite(options.updatesPerDot) ? options.updatesPerDot! : 5;
    this._dotUpdates = 0;
    this._color = options.color === undefined ? true : Boolean(options.color);
    this._renderInterval = Math.floor(1000.0 / options.renderFps! + 0.5);
    this._spinTimers = {};
    this._renderTimer = null;
    this._colorPrefix = {};
    this._defaultPrefix = "";
    this._chalkLevel = 0;
    this._dots = 0;

    if (options.renderFps! < 1 || options.renderFps! >= 1000) {
      throw new Error("VisualLogger renderFps must be >= 1 and < 1000");
    }

    this.setPrefix();
  }

  get logData(): string[] {
    return this._logData;
  }

  get color(): boolean {
    return this._color;
  }

  set color(enable: boolean) {
    this._color = enable;
    this.setPrefix();
  }

  static get spinners(): string[] {
    return ["|/-\\", "⠁⠁⠉⠙⠚⠒⠂⠂⠒⠲⠴⠤⠄⠄⠤⠠⠠⠤⠦⠖⠒⠐⠐⠒⠓⠋⠉⠈⠈", "⢹⢺⢼⣸⣇⡧⡗⡏", "⣾⣽⣻⢿⡿⣟⣯⣷"];
  }

  static get Levels(): typeof Levels {
    return Levels;
  }

  static get LogItemTypes(): typeof LogItemTypes {
    return LogItemTypes;
  }

  private _getItemKeys(): (string | symbol)[] {
    return (Object.keys(this._itemOptions) as (string | symbol)[]).concat(
      Object.getOwnPropertySymbols(this._itemOptions)
    );
  }

  addItem(options: ItemOptions): this {
    const name = options.name;

    if (this._items.indexOf(name) >= 0) return this;

    this._getItemKeys().forEach((k) => {
      const itemOpt = this._itemOptions[k as string];
      if (itemOpt._spinning) {
        itemOpt._spinning = SPIN_STARTED;
      }
    });

    const itemOpt: ItemOptions = { spinInterval: DEFAULT_SPINNER_INTERVAL, ...options };
    if (!itemOpt.color) {
      itemOpt.color = "white";
    }
    itemOpt._display = this._colorize(itemOpt.color, itemOpt.display || String(name));
    itemOpt._msg = this._renderLineMsg(itemOpt, "");
    this._itemOptions[name as string] = itemOpt;
    this._startItemSpinner(itemOpt);
    this._items.push(name);
    this._lines.push(this._renderLine(itemOpt));

    return this;
  }

  setItemType(flag?: string | false): this {
    if (!flag) {
      this._itemType = LogItemTypes.none;
    } else {
      this._itemType = LogItemTypes[flag as LogItemType] || LogItemTypes.none;
    }

    if (this._itemType === LogItemTypes.normal && !this._output.isTTY()) {
      this._itemType = LogItemTypes.simple;
    }

    if (this._itemType === LogItemTypes.simple) {
      this._dots = 0;
    }
    return this;
  }

  hasItem(name: string | symbol): boolean {
    return Boolean(this._itemOptions[name as string]);
  }

  removeItem(name: string | symbol): this {
    const options = this._itemOptions[name as string];
    if (!options) return this;

    this.clearItems();

    const x = this._items.indexOf(name);
    this._items.splice(x, 1);
    this._lines.splice(x, 1);
    delete this._itemOptions[name as string];
    this._stopItemSpinner(options);

    this._renderOutput();

    return this;
  }

  private _colorize(color: string, str: string): string {
    if (this._color) {
      return (chalk as any)[color](str);
    }
    return str;
  }

  setPrefix(prefixStr?: string): this {
    this._colorPrefix = {};
    const prefix = (this._defaultPrefix = prefixStr === undefined ? "> " : prefixStr);
    this._chalkLevel = chalk.level;
    Object.keys(LevelColors).forEach((level) => {
      const color = LevelColors[level as LogLevel];
      if (color && this._color && this._chalkLevel > 0) {
        this._colorPrefix[level] = this._colorize(color, prefix);
      } else {
        this._colorPrefix[level] = prefix;
      }
    });
    return this;
  }

  prefix(x?: string | false): this {
    this._prefix = x === false ? "" : x;
    return this;
  }

  debug(...args: any[]): this {
    return this._log("debug", args);
  }

  verbose(...args: any[]): this {
    return this._log("verbose", args);
  }

  info(...args: any[]): this {
    return this._log("info", args);
  }

  log(...args: any[]): this {
    return this._log("info", args);
  }

  warn(...args: any[]): this {
    return this._log("warn", args);
  }

  error(...args: any[]): this {
    return this._log("error", args);
  }

  fyi(...args: any[]): this {
    return this._log("fyi", args);
  }

  private _nextSpin(options: ItemOptions): boolean {
    if (!options.spinner || !options._spinning) {
      return false;
    }

    if (options._spinning === SPIN_STARTED || !Number.isInteger(options.spinIx)) {
      options.spinIx = 0;
      options._spinning = SPIN_RUNNING;
    } else {
      options.spinIx!++;
    }

    if (options.spinIx! >= (options.spinner as string).length) {
      options.spinIx = 0;
    }

    return true;
  }

  updateItem(name: string | symbol, data?: string | UpdateData): this {
    const options = this._itemOptions[name as string];
    if (!options) return this;

    const itemIdx = this._items.indexOf(name);

    if (data !== undefined) {
      this._renderLineMsg(options, data);
      const updateData = typeof data === "string" ? {} : data;
      if (options.save !== false && updateData._save !== false) {
        this._save(options._msg!);
      }

      if (updateData._render === false) return this;
    }

    if (this._shouldLogItem()) {
      if (data === undefined && !this._nextSpin(options)) {
        return this;
      }

      this._lines[itemIdx] = this._renderLine(options);
      this._renderOutput();
    } else {
      this._lines[itemIdx] = options._msg!;

      this._writeSimpleDot();
    }

    return this;
  }

  clearItems(): this {
    if (this._shouldLogItem() && this._lines.length > 0) {
      this._output.visual.clear();
    } else {
      this._checkSimpleDots();
    }
    return this;
  }

  freezeItems(showItems?: boolean): this {
    this._getItemKeys().forEach((k) => {
      this._stopItemSpinner(this._itemOptions[k as string]);
    });
    this._output.visual.clear();
    this._resetSimpleDots();
    if (showItems) this._output.write(`${this._lines.join("\n")}\n`);
    this._backupItemType = this._itemType;
    this._itemType = 0;

    return this;
  }

  unfreezeItems(): this {
    if (this._backupItemType) {
      this._itemType = this._backupItemType;
      this._backupItemType = undefined;
      for (const name in this._itemOptions) {
        this._startItemSpinner(this._itemOptions[name]);
      }
    }

    return this;
  }

  shutdown(showItems?: boolean): void {
    this.freezeItems(showItems);
    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
    }
  }

  private _checkSimpleDots(): void {
    if (this._itemType === LogItemTypes.simple && this._dots >= this._maxDots) {
      this._dots = 0;
      this._output.write("\n");
    }
  }

  private _resetSimpleDots(): void {
    if (this._dots > 0) {
      this._dots = 0;
      this._output.write("\n");
    }
  }

  private _writeSimpleDot(): void {
    if (this._itemType === LogItemTypes.simple) {
      this._dotUpdates++;
      if (this._dotUpdates === this._updatesPerDot) {
        this._dotUpdates = 0;
        this._dots++;
        this._output.write(".");
        this._checkSimpleDots();
      }
    }
  }

  private _isAllSpinItemsStop(spinTimer: SpinTimer): boolean {
    const spinItems = this._getItemKeys().filter((k) => {
      return this._itemOptions[k as string].spinInterval === spinTimer.spinInterval;
    });
    return spinItems.every((k) => {
      return !this._itemOptions[k as string]._spinning;
    });
  }

  private _startSpinTimer(options: ItemOptions): void {
    const { spinInterval } = options;
    let spinTimer = this._spinTimers[spinInterval!];
    if (!spinTimer) {
      spinTimer = this._spinTimers[spinInterval!] = { spinInterval: spinInterval! };
    }
    if (!spinTimer.timer && this._shouldLogItem()) {
      spinTimer.timer = setInterval(() => {
        let update = 0;
        this._getItemKeys().forEach((name) => {
          const itemOpt = this._itemOptions[name as string];
          if (itemOpt._spinning && itemOpt.spinInterval === spinInterval) {
            this._nextSpin(itemOpt);
            const itemIdx = this._items.indexOf(itemOpt.name);
            this._lines[itemIdx] = this._renderLine(itemOpt);
            update++;
          }
        });
        return update && this._renderOutput();
      }, spinInterval!);
      spinTimer.timer.unref();
    }
  }

  private _stopSpinTimer(options: ItemOptions): void {
    const { spinInterval } = options;
    const spinTimer = this._spinTimers[spinInterval!];
    if (!spinTimer) {
      return;
    }
    if (this._isAllSpinItemsStop(spinTimer)) {
      clearInterval(spinTimer.timer);
      this._spinTimers[spinInterval!] = { spinInterval: spinInterval! };
    }
  }

  private _startItemSpinner(options: ItemOptions): void {
    if (this._shouldLogItem() && !options._spinning) {
      let spinner = options.spinner;
      if (spinner === true) {
        spinner = VisualLogger.spinners[1];
      } else if (
        typeof spinner === "number" &&
        spinner >= 0 &&
        spinner < VisualLogger.spinners.length
      ) {
        spinner = VisualLogger.spinners[spinner];
      }
      options.spinner = spinner as string | undefined;

      if (options.spinner) {
        options._spinning = SPIN_STARTED;
        options.spinIx = 0;
        this._startSpinTimer(options);
      }
    }
  }

  private _stopItemSpinner(options: ItemOptions): this {
    options._spinning = SPIN_OFF;
    this._stopSpinTimer(options);

    return this;
  }

  private _renderOutput(): this {
    if (!this._renderTimer && this._shouldLogItem() && this._lines.length > 0) {
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._output.visual.write(this._lines.join("\n"));
      }, this._renderInterval);
      this._renderTimer.unref();
    }
    return this;
  }

  private _renderLine(options: ItemOptions): string {
    const spin =
      options.spinner && Number.isInteger(options.spinIx)
        ? `${(options.spinner as string)[options.spinIx!]} `
        : "";
    return `${spin}${options._msg}`;
  }

  private _renderLineMsg(options: ItemOptions, data: string | UpdateData): string {
    let display: string | undefined;
    let msg: string;
    if (typeof data === "string") {
      msg = data;
    } else {
      msg = data.msg || "";
      display = data.display && this._colorize(options.color!, data.display);
    }
    options._msg = `${display || options._display}: ${msg}`;
    return options._msg;
  }

  private _save(line: string): void {
    if (this._options.saveLogs !== false) {
      this._logData.push(line);
    }
  }

  private _genLog(level: LogLevel, args: any[]): string {
    let prefix: string;

    if (this._prefix !== undefined) {
      prefix = this._prefix || "";
      this._prefix = undefined;
    } else {
      if (this._chalkLevel !== chalk.level) {
        this.setPrefix(this._defaultPrefix);
      }
      prefix = this._colorPrefix[level];
    }

    const str = `${prefix}${util.format(...args)}`;
    this._save(str);

    return str;
  }

  private _log(l: LogLevel, args: any[]): this {
    const str = this._genLog(l, args);

    if (Levels[l] >= this._logLevel) {
      this.clearItems();
      this._resetSimpleDots();
      this._output.write(`${str}\n`);
      this._renderOutput();
    }

    return this;
  }

  private _shouldLogItem(): boolean {
    return this._itemType === LogItemTypes.normal && this._logLevel <= VisualLogger.Levels.info;
  }
}

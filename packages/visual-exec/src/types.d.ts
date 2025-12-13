declare module "visual-logger" {
  interface ItemOptions {
    name: string | symbol;
    color?: string;
    display?: string;
    spinner?: any;
    msg?: string;
    _save?: boolean;
    _render?: boolean;
  }

  interface UpdateOptions {
    msg?: string;
    _save?: boolean;
    _render?: boolean;
  }

  class VisualLogger {
    static spinners: any[];

    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    debug(...args: any[]): void;
    verbose(...args: any[]): void;

    addItem(options: ItemOptions): void;
    removeItem(name: string | symbol): void;
    updateItem(name: string | symbol, options: UpdateOptions): void;
    setItemType(type: string): void;
    prefix(enabled: boolean): VisualLogger;
  }

  export = VisualLogger;
}

declare module "xsh" {
  interface ExecOptions {
    silent?: boolean;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
  }

  interface ExecResult {
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    promise: Promise<{ stdout: string; stderr: string }>;
  }

  export function exec(options: ExecOptions, command: string): ExecResult;
  export let Promise: PromiseConstructor;
}

declare module "has-ansi" {
  function hasAnsi(str: string): boolean;
  export = hasAnsi;
}

import { EventEmitter } from "events";

// Type for task execution options
interface TaskOptions {
  flags?: string | string[];
  [key: string]: any;
}

// Type for task specification
interface TaskSpec {
  cmd: string | string[];
  flags?: string | string[];
  [key: string]: any;
}

// Type for environment update options
interface EnvUpdateOptions {
  override?: boolean;
  posix?: boolean;
}

// Type for namespace and tasks
interface TasksDefinition {
  [key: string]: any;
}

// Type for XTaskSpec class
declare class XTaskSpec {
  constructor(spec: TaskSpec);
}

// Type for XTasks class
declare class XTasks {
  constructor(namespace: string | object, tasks?: TasksDefinition);
  load(tasks: TasksDefinition): void;
  load(namespace: string | object, tasks: TasksDefinition, priority?: number): void;
  hasFinally(): boolean;
  count(): number;
  fullNames(): string[];
}

// Type for XQTree class
declare class XQTree {
  create(options: { name: string; value?: any }): any;
}

// Type for the main XRun class
declare class XRun extends EventEmitter {
  constructor(namespace?: string | object, tasks?: TasksDefinition);

  // Properties
  failed: Error | null;
  stopOnError: boolean | "soft" | "full" | "";

  // Methods
  load(tasks: TasksDefinition): this;
  load(namespace: string | object, tasks: TasksDefinition, priority?: number): this;
  run(tasks: string | any[], done?: (err?: Error | Error[]) => void): this;
  asyncRun(tasks: string | any[]): Promise<any>;
  printTasks(): this;
  countTasks(): number;
  getNamespaces(): object;
  fail(err: Error): this;
  waitAllPending(done: () => void): this;
  stop(): symbol;
  exec(spec: string | string[] | TaskSpec, options?: string | string[] | TaskOptions): XTaskSpec;
  updateEnv(envValues: object, options?: EnvUpdateOptions): void;
  env(spec: object, options?: EnvUpdateOptions): void;
  concurrent(...tasks: any[]): any[];
  parallel(...tasks: any[]): any[];
  serial(...tasks: any[]): any[];

  // Internal methods
  private _exitOnError(err: Error | Error[]): void;
  private _showSimilarTasks(res: { name: string }): void;
  private exit(code: number): void;
  private killTaskChildren(): void;
  private actStop(): void;
}

// Type for the xrun instance
declare const xrun: XRun & {
  XClap: typeof XRun;
  XRun: typeof XRun;
  XTaskSpec: typeof XTaskSpec;
  XReporterConsole: any;
};

export = xrun;

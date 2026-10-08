# @fynjs/run reference

`@fynjs/run` runs npm scripts, shell commands and JavaScript tasks, serially or concurrently, from the `xrun` command or from code. It installs two bins, `xrun` and `qrun` (`xrun` with logs silenced).

## Imports

The package root has one export, the shared `xrun` instance. Every API below is a property or method of that instance.

```js
// ESM
import xrun from "@fynjs/run";

// CommonJS: require() returns the instance itself, not a namespace
const xrun = require("@fynjs/run");
```

- There are no named exports. `import { load, serial } from "@fynjs/run"` does not work. Use `xrun.load` and `xrun.serial`.
- The root default export is typed `any`.
- The instance also carries the classes `xrun.XRun` (alias `xrun.XClap`), `xrun.XTaskSpec` and `xrun.XReporterConsole`.
- `@fynjs/run/cli/xrun` exports `xrunMain` as its default, see [`xrunMain`](#xrunmain). `@fynjs/run/package.json` is also exported.
- The package is ESM (`"type": "module"`). It needs Node `^22.22.2 || ^24.15.0 || >=26.0.0`.

## `xrun` and `qrun` commands

```
xrun [options] [--] [task1 [task options] task2 [task options] ...]
```

`qrun` sets `XRUN_QUIET=1` and then behaves exactly like `xrun`.

When a project has its own installed `@fynjs/run`, the bin runs that copy rather than the one it lives in. A copy is looked up from the current directory first, then from the bin file.

### CLI Options

Every option defined by the CLI is listed here. Booleans accept `--name`, `--name=false` and `--no-name`.

| Option | Alias | Type | Default | Behavior |
| --- | --- | --- | --- | --- |
| `--cwd <path>` | `-w` | string | process CWD | Set xrun's CWD. Passing it turns off the upward search for a task file. |
| `--dir <path>` | `-d` | string | CWD | Directory, relative to CWD, to look for the task file. |
| `--npm [bool]` | `-n` | boolean | `true` | Load `package.json` scripts into namespace `npm`. `--no-npm` disables. |
| `--nmbin [bool]` | `-b` | boolean | `true` | Add `CWD/node_modules/.bin` to the front of `PATH`, if that directory exists. |
| `--list [namespaces]` | `-l` | string | all namespaces | List task names from comma separated namespaces, then exit 0. |
| `--full` | `-f` | count | 0 | With `--list`, print full names: `ns/name`, and `/name` for the root namespace. Repeat (`-ff`) to also put a leading `/` on every name. |
| `--ns` | `-m` | boolean | `false` | List all namespaces, then exit 0. |
| `--soe [mode]` | `-e` | `no`, `soft`, `full` | `full` | Stop on error mode, see [Stop on Error Modes](#stop-on-error-modes). `no` means `""`. Any other value fails an assertion. |
| `--quiet [bool]` | `-q` | boolean | `false` | Suppress xrun's own logs. When not given, the value of env `XRUN_QUIET` (`"1"` means quiet) is used. When given, it sets `XRUN_QUIET=1` for nested runs. |
| `--serial [bool]` | `-s`, `-x`, `--ser` | boolean | `false` | Run the tasks named on the command line serially. |
| `--concurrent [bool]` | `-c`, `--conc` | boolean | `true` | Run the tasks named on the command line concurrently. This is the default. |
| `--env <K=V...>` | none | string array | none | Set env vars in `process.env` before running tasks, ie: `--env NODE_ENV=development FOO=BAR -.`. Only text up to the next `=` is kept as the value. |
| `--require <modules...>` | `-r` | string array | none | Load these modules for tasks instead of the task file. Resolved from CWD, loaded in the order given. |
| `--help` | `-h`, `-?` | | | Added by the argument parser. |
| `--version` | `-V`, `-v` | | | Added by the argument parser. |
| `--options` | none | | | Only recognized as the sole argument (`xrun --options`). Prints `--name` and `-alias` for each option above, for shell auto completion, then exits 0. |

Notes:

- `--serial` is applied only when there is more than one task on the command line.
- With no task on the command line, xrun prints the task list and usage, then exits 1.
- If no task is found at all, xrun prints a diagnostic and exits 1.
- The options of the xrun command come first. Options after a task name belong to that task, see [Task Options](#task-options).

### Task Execution

Tasks can be executed in various ways:

```bash
# Run single task
xrun build

# Run multiple tasks concurrently
xrun lint test

# Run multiple tasks serially
xrun --serial build test deploy

# Run namespaced task
xrun npm/test
xrun pkg/hello

# Optional task execution (won't fail if task not found)
xrun ?optional-task
```

Task name rules:

- A leading `?` makes the task optional. A missing optional task is skipped.
- `ns/name` selects a namespace. A leading `/` alone selects the root namespace. See [Namespace](#namespace).
- When a `--` follows, see [Argument Passing](#argument-passing).
- A leading `/` on a name that has a second `/` is stripped, so `xrun /ns/name` runs `ns/name`.

### Argument Passing

Arguments after `--` are appended to the shell command of the task named last on the command line. This applies only when that task is itself a shell command task. It does not reach shell commands inside an array task.

```bash
xrun test -- --grep "specific test"
xrun build -- --watch --verbose
```

Appended arguments that contain a space are wrapped in double quotes.

Options and arguments written after a task name, before `--`, are also appended to the shell command of that task. For a function task they are parsed into the [execution context](#execution-context).

### Array Tasks from Command Line

You can specify complex task arrays directly from the command line:

```bash
# Concurrent execution
xrun [task1, task2, task3]

# Serial execution with --serial
xrun --serial [task1, task2, task3]

# Mixed execution (serial then concurrent)
xrun --serial [task1, task2, [task3, task4]]

# As a quoted string
xrun "[task1, task2, [task3, task4]]"
```

If the first argument starts with `[`, all arguments are joined with a space and parsed as an array. A parse failure prints `Parsing array of tasks failed` and the run does not start.

### Task File Discovery

Unless `--require` is used, xrun looks for a task file in the search directory, which is CWD joined with `--dir`.

1. A directory entry is a match if its name starts with one of these prefixes, tried in this order: `xrun-tasks`, `xrun`, `xclap.`, `clapfile.`, `clap.`, `gulpfile.`. Any extension matches.
2. If the directory has no match, the subdirectories `scripts`, `tools`, `build` and `tasks` are checked the same way.
3. If still not found, and `--cwd` was not given, xrun moves to the parent directory and repeats. It stops at the first directory that has a `package.json`, or at the file system root.
4. When a file is found, xrun changes its CWD to the directory where it was found.

The file is loaded with `import()`, so a task file can use top-level await. Files ending in `.ts`, `.tsx`, `.mts` or `.cts` first start a TypeScript runner, see [TypeScript Support](#typescript-support).

What a task file or `--require` module may export:

- A function. It is called with the `xrun` instance and should call `xrun.load`.
- An object. A `default` export is processed the same way. Otherwise a non-empty object is loaded into namespace `xrun`.
- Nothing. A file that calls `xrun.load` itself needs no export.

The task file name `xrun-tasks.js` is the default name used in messages. `--require` modules that cannot be resolved are logged as errors and skipped.

### `xrunMain`

```ts
xrunMain(argv?: string[], offset?: number, xrunPath?: string, done?: (err?: Error) => void): Promise<unknown>
```

The default export of `@fynjs/run/cli/xrun`, also what the `xrun` bin calls. It is async. A caller must `await` it to observe the run.

- With no `argv`, it parses `process.argv` from index 2. Otherwise it parses `argv` from `offset`.
- Without `done`, xrun exits the process on listing, help and error conditions. With `done`, it calls `done` with an error that carries `exitCode`, even for exit code 0.

## Provider Packages

Provider packages allow you to create reusable task libraries that can be shared across projects.

### Using Provider Packages

Provider packages are searched in the dependencies of CWD's `package.json` (`optionalDependencies`, `devDependencies` and `dependencies`) when:

1. No task file or `--require` module was loaded (automatic discovery), or
2. The `package.json` has `"loadProviderModules": true` under its `@fynjs/run` key, see [Package.json Configuration](#packagejson-configuration).

A dependency is treated as a provider if either is true:

- Its `package.json` has an `xrunProvider` field.
- Its own `dependencies` list `@fynjs/run` (or the older name `@xarc/run`).

For each provider, xrun requires the module and calls its `loadTasks` export with the `xrun` instance. A provider without a `loadTasks` function is ignored. The module required is the package name, or `<name>/<module>` if `xrunProvider.module` is set.

#### Installation and Configuration

1. Install the provider package:

```bash
fyn add --dev @my-org/build-tasks
```

2. (Optional) Explicitly enable provider module loading in your `package.json`:

```json
{
  "@fynjs/run": {
    "loadProviderModules": true
  }
}
```

3. Create an `xrun-tasks.js` to use the provider:

```js
const { loadTasks } = require("@my-org/build-tasks");
loadTasks();

// You can also load your own tasks
const xrun = require("@fynjs/run");
xrun.load({
  "my-custom-task": "echo hello"
});
```

### Creating Provider Packages

To create a provider package:

1. Create a module that exports a `loadTasks` function:

```js
// index.js of your provider package
function loadTasks(xrun) {
  const runner = xrun || require("@fynjs/run");

  runner.load("build", {
    compile: "babel src -d lib",
    bundle: "webpack --mode production",
    clean: "rimraf lib dist"
  });

  runner.load("test", {
    unit: "jest",
    e2e: "cypress run",
    coverage: "nyc npm run test:unit"
  });
}

module.exports = { loadTasks };
```

2. Mark the package as a provider so xrun finds it. Either list `@fynjs/run` in its `dependencies`, or add an `xrunProvider` field:

```json
{
  "name": "@my-org/build-tasks",
  "main": "index.js",
  "xrunProvider": {
    "module": "lib/tasks.js"
  }
}
```

`xrunProvider.module` is optional. It is a path inside the package.

## TypeScript Support

xrun loads TypeScript task files after starting a runner. It tries these in order and uses the first that loads:

1. `@fynjs/ts-resolve/register`. A resolve hook feeding Node's own type stripping. Needs Node >= 22.15.
2. `ts-node/register/transpile-only`.

Neither is a dependency of `@fynjs/run`. Install one in the project. If neither loads, xrun logs `Unable to load a typescript runner` with each error. `tsx` is not used by xrun.

### Supported Files

- `xrun-tasks.ts` - TypeScript task file
- `xrun-tasks.mts` - TypeScript ES modules
- `xrun-tasks.cts` - TypeScript CommonJS
- `xrun-tasks.tsx` - the runner starts, but whether the file loads depends on the runner

Node's type stripping cannot transform enums, namespaces or parameter properties. A file using them fails with a message naming the limit. Rewrite them, or run Node with `--experimental-transform-types`.

### Example TypeScript Task File

```typescript
import xrun from "@fynjs/run";

interface BuildOptions {
  production?: boolean;
  watch?: boolean;
}

const buildTask = (options: BuildOptions = {}) => {
  const mode = options.production ? "production" : "development";
  const watchFlag = options.watch ? "--watch" : "";
  return xrun.exec(`webpack --mode ${mode} ${watchFlag}`);
};

xrun.load({
  build: buildTask(),
  "build:prod": buildTask({ production: true }),
  "build:watch": buildTask({ watch: true }),

  test: xrun.concurrent(xrun.exec("jest"), xrun.exec("eslint src/")),

  ci: xrun.serial("test", "build:prod")
});
```

## Package.json Configuration

xrun reads one config object from the `package.json` in CWD. The key is the first one present of `xclap`, `xrun`, `@fynjs/run`. Only two fields are used. `cwd` is ignored.

| Field | Type | Default | Behavior |
| --- | --- | --- | --- |
| `tasks` | object | none | Tasks loaded into namespace `pkg`. |
| `loadProviderModules` | boolean | `false` | Search dependencies for [provider packages](#provider-packages) even when a task file loaded. |

Other CLI options, such as `npm` or `soe`, are not read from `package.json`. Set them on the command line.

### Task Definition in Package.json

You can define simple tasks directly in `package.json` without JavaScript capability:

```json
{
  "name": "my-app",
  "@fynjs/run": {
    "tasks": {
      "hello": "echo hello from package.json",
      "build": "webpack --mode production",
      "test": ["lint", "unit-test"],
      "deploy": {
        "desc": "Deploy to production",
        "task": ["build", "upload", "notify"]
      }
    }
  }
}
```

These tasks are loaded into the `pkg` namespace and can be invoked as:

- `xrun pkg/hello`
- `xrun hello` (if no conflicts with other namespaces)

### npm Scripts

Unless `--no-npm` is given, the `scripts` of the nearest `package.json` (searched upward from CWD) are loaded into namespace `npm`.

- Each script runs as a shell command with the `npm` flag, which implies `tty` and `spawn`.
- The environment gets `npm_lifecycle_event`, `npm_lifecycle_script`, `npm_package_name`, `npm_package_version`, `npm_package_json`, `npm_execpath`, `npm_node_execpath`, `NODE`, `INIT_CWD` and `PWD`.
- A script whose name does not start with `pre` or `post` runs as a serial array of `pre<name>` (if defined), the script, and `post<name>` (if defined).
- A script whose name starts with `pre` or `post` is loaded as a plain script, with no hooks of its own.

## Creating Tasks

Tasks are defined in an object, for example:

```js
const tasks = {
  xfoo1: `echo "a direct shell command xfoo1"`,
  xfoo2: `echo "a direct shell command xfoo2"`,
  xfoo3: `echo "a direct shell command xfoo3"`,
  xfoo4: () => console.log("hello, this is xfoo4"),
  foo2: ["xfoo1", "xfoo2", "xfoo3", "xfoo4"],
  foo3: {
    desc: "description for task foo3",
    task: () => {
      console.log("function task for foo3");
    }
  }
};
```

## Loading Tasks

Tasks can be loaded with `xrun.load`. You can specify a namespace for the tasks. See [`load`](#loadnamespace-tasks-priority).

```js
import xrun from "@fynjs/run";
xrun.load(tasks);
// or load into a namespace
xrun.load("myapp", tasks);
```

## Task Definition

### Direct Action Task

Ultimately, a task would eventually resolve to some kind of runnable action that's either a function, a shell string, or a list of other tasks to run.

A task can define its direct action as one of:

- [A string](#string) - as a shell command to be spawned, or as a [string that contains an array](#string-array)
- [An array](#array) - list of tasks to be processed and execute [serially](#serially) or [concurrently](#concurrently).
- [A function](#function) - to be called, which can return more tasks to execute.
- [Task Spec](#task-spec) - created using the [exec API](#execspec-options), as a shell command to run.

### A Task Object

To allow decorating a task with more information such as name and description, the task definition can be an [object](#object), which should contain a `task` field that defines a [direct action task](#direct-action-task).

### String

- A string primarily is executed as a shell command.
- A string [started with `"~["`](#string-array) is parsed into an [array task](#array).

```js
{
  foo: "echo hello";
}
```

`xrun foo` will cause the shell command `echo hello` to be spawned.

Shell commands run through `child_process.exec` unless a [flag](#shell-task-flags) says otherwise. Arguments from the command line or from [inline task options](#inline-task-options) are appended to the command.

These environment variables are defined for a shell command, mainly for the [`finally`](#finally-hook) hook:

- `XRUN_ERR` - If the task failed, this contains the error message.
- `XRUN_FAILED` - If any task failed, this is set to `true`.

`XCLAP_ERR` and `XCLAP_FAILED` are set to the same values for older scripts.

#### String Array

If a string task starts with `"~["` then it's parsed as an array with string elements and executed as [array task](#array).

For example:

```js
{
  foo: "~[ foo1, foo2, foo3 ]";
}
```

Will be the same as specifying `foo: [ "foo1", "foo2", "foo3" ]` and processed as [array task](#array).

### Array

If the task is an array, then it can contain elements that are strings, functions or task specs.

- Functions are treated as a [task function](#function) to be called.
- Strings in a task array are primarily treated as name of another task to look up and execute.
- String started with `"~$"` or `"~@"` are treated as [anonymous shell commands](#anonymous-string-shell-command) to be executed.

The [array serial/concurrent rules](#array-serialconcurrent-rules) will be applied.

```js
{
  foo: ["foo1", "foo2", "foo3"];
}
```

`xrun foo` will cause the three tasks `foo1`, `foo2`, `foo3` to be executed **_serially_**.

#### Anonymous String Shell Command

If the task name in a task array starts with `"~$"` or `"~@"` then the rest of it is executed as an anonymous shell command directly.

For example:

```js
{
  foo: ["foo1", "~$echo hello"];
}
```

Will cause the task `foo1` to be executed and then the shell command `echo hello` to be executed.

##### Shell Task Flags

Any string that's to be a shell command can have flags like this:

```js
{
  foo: `~(tty)$node -e "console.log('isTTY', process.stdout.isTTY)"`;
}
```

- The leading part `~(tty)$` is specifying a shell command with flags `(tty)`. The closing can be `)$` or `)@`.
- Multiple flags can be specified like this: `~(tty,sync)$`.
- Flag names are case insensitive. An unknown flag fails the task with `Unknown flag`. A missing closing `)$` fails the task with `Missing )$`.

These are supported flags:

- `tty` - Use [child_process.spawn] to launch the shell command with TTY control. **WARNING** Only one task at a time can take over the TTY.
- `spawn` - Use [child_process.spawn] API instead of [child_process.exec] to launch the shell process. TTY control is not given.
- `sync` - If either `tty` or `spawn` flag exist, then use [child_process.spawnSync] API. This will cause concurrent tasks to wait. It has no effect alone.
- `noenv` - Do not pass `process.env` to child process.
- `npm` - Implies `tty` and `spawn`. Used for npm scripts.

### Function

```js
{
  foo: function (context) { return Promise.resolve("hello"); }
}
```

`xrun foo` will cause the function to be called.

The `this` context for the function will be the xrun [Execution Context](#execution-context), also passed as the first argument. If you don't want to use `this`, then you can use arrow functions for your task.

How a function signals completion:

- Two parameters: `(context, done)`. The task ends when `done(err, value)` is called.
- One parameter on a non-async function: if the parameter is named `ctx` or `context`, it receives the context. Any other name receives the `done` callback, and the task ends when `done` is called. xrun decides this by reading the function source text.
- Otherwise the function gets the context and its return value decides, see below.

The function can return:

- `Promise` - `xrun` will await for the promise.
- [node.js stream] - `xrun` will wait for the stream to close or error.
- `array` - `xrun` will treat the array as a list of tasks to be executed
  - The [array serial/concurrent rules](#array-serialconcurrent-rules) applied to the array.
  - The [anonymous shell command](#anonymous-string-shell-command) rule applied to each string element.
- `string` - `xrun` will treat the string as a task name, an [anonymous shell command to be executed](#anonymous-string-shell-command), or a `"~["` string array.
- `function` - `xrun` will call the function as another task function.
- a [task spec](#task-spec) or the value of [`stop()`](#stop) - run as a task.
- a child process, or an object with a `child` field that is a child process - the child is tracked so it can be killed on stop.
- `undefined` or any other value - the task is done as soon as the function returns.

An error thrown by the function, or a rejected promise, fails the task. A child process killed with SIGTERM is not treated as a failure.

### Task Spec

A direct action task can also be defined as a task spec.

Right now the supported spec types are a shell command, created with [`exec`](#execspec-options), and an environment update, created with [`env`](#envspec-options).

This is a more systematic approach to declare an [anonymous string shell command](#anonymous-string-shell-command).

A task spec shell command can be declared as the task or a task in the array:

```js
const xrun = require("@fynjs/run");

const tasks = {
  hello: xrun.exec("echo hello"),
  foo: [xrun.exec("echo foo"), xrun.exec("echo bar")]
};

xrun.load(tasks);
```

### Object

You can define your task as an object in order to specify more information.

For example:

```js
{
  task1: {
    desc: "description",
    task: <task-definition>,
    dep: <task-definition>,
    finally: <finally-hook-definition>
  }
}
```

Where:

| Field | Type | Behavior |
| --- | --- | --- |
| `desc` | string | Description, shown in the task list. An object task without `desc` is listed as a task with no description. |
| `task` | direct action | Defines a [direct action task](#direct-action-task). |
| `dep` | direct action | Runs before `task`. When it is an array it runs serially. |
| `finally` | direct action | Always runs after the task finishes or fails, see [finally hook](#finally-hook). |
| `flags` | object | Shell task flags to merge in, ie: `{ tty: true }`. Applies when `task` is a shell command. |
| `options` | object | Options for `child_process` (ie: `env`, `cwd`) used when `task` is a shell command. |
| `argOpts` | object | CLI options this task accepts, see [Task Options](#task-options). |
| `cliParser` | object | `{ options, subCommands, allowUnknownOption }`. Full option and sub command spec for the task. `options` is used when `argOpts` is absent. |
| `allowUnknownOption` | boolean | Default `true`. Set `false` to fail on options the task does not define. `cliParser.allowUnknownOption` takes precedence. |

#### finally hook

When defining task as an object, you can have a `finally` property that defines [direct action task](#direct-action-task) which is always executed after the task completes or fails. Generally for doing clean up chores.

Note that the finally hook is processed the same way as a task. Other tasks that are referenced by the `finally` hook will not have their `finally` hook invoked.

The task's error is available as `context.err` in a function hook, and as `XRUN_ERR` in a shell hook. Hooks do not run after [`stop()`](#stop) was invoked.

If you set `stopOnError` to `full`, then be careful if you have concurrent running tasks, because `full` stop immediately abandon all pending async sub tasks, but since xrun can't reliably cancel them, they could be continuing to run, and therefore could cause concurrent conflict with your finally hook. xrun emits a `warn-finally` event when any loaded task has a `finally` and the mode is `full`.

If you have async task, it's best you set [`stopOnError`](#stoponerror) to `soft`.

## Array serial/concurrent rules

When you define a task as an array, it should contain a list of task names to be executed serially or concurrently.

Generally, the array of tasks is executed concurrently, and only serially when [certain conditions](#serially) are true.

An task array can also be explicitly created as concurrent using the [concurrent API](#concurrenttasks--task1-task2-taskn)

### Serially

Each task in the array is executed serially if one of the following is true:

- The array is defined at the [top level](#top-level).
- The array is created by the [serial API](#serialtasks--task1-task2-taskn).
- The first element of the array is [`"."`](#first-element-dot) **DEPRECATED** use the [serial API](#serialtasks--task1-task2-taskn) instead. The first element `"-s"`, `"--serial"` or `"--ser"` has the same effect.

#### Using serial API

Create an array of serial tasks within another concurrent array:

```js
const xrun = require("@fynjs/run");

const tasks = {
  foo: xrun.concurrent("a", xrun.serial("foo1", "foo2", "foo3"))
};

xrun.load(tasks);
```

#### top level

At top level, an array of task names will be executed serially. Top level means the array is the `task` of a task object or the task definition itself. An array returned by a function, or passed to `run`, is not top level.

```js
const tasks = {
  foo: ["foo1", "foo2", "foo3"]
};

xrun.load(tasks);
```

#### First element dot

> **DEPRECATED** - Please use the [serial API](#serialtasks--task1-task2-taskn) instead.

If the first element of the array is `"."` then the rest of tasks in the array will be executed serially.

```js
{
  foo: ["bar", [".", "foo1", "foo2", "foo3"]];
}
```

#### Concurrently

By default, an ordinary array of tasks is executed concurrently, except when it's defined at the [top level](#top-level). A first element of `"--concurrent"`, `"-c"` or `"--conc"` also marks an array concurrent.

If you need to have an array of tasks at the top level to execute concurrently, use the [concurrent API](#concurrenttasks--task1-task2-taskn) to create it.

```js
const xrun = require("@fynjs/run");

const tasks = {
  foo: xrun.concurrent("foo1", "foo2", "foo3")
};

xrun.load(tasks);
```

> `xrun foo` will execute tasks `foo1`, `foo2`, and `foo3` **_concurrently_**.

## Namespace

A group of tasks can be assigned a namespace and allows you to have tasks with the same name so you can modify certain tasks without replacing them.

For example:

```js
xrun.load([namespace], tasks);
```

You refer to the namespaces with `/`, ie: `ns/foo`.

Anything that was loaded without a namespace is assigned to the default namespace `/`, which can be accessed with a simple leading `/`, ie: `/foo`.

If you run a task without specifying the namespace, then it's searched through all namespaces until it's found. The default namespace is the first one to search. The rest follow their [priority and override order](#namespace-overrides), and namespaces of equal priority are searched in the order they were loaded.

> For obvious reasons, this means task names cannot contain `/`.

Namespaces created by xrun itself: `npm` (npm scripts), `pkg` (`package.json` tasks), and `xrun` (object exports of a task file).

### Auto Complete with namespace

To assist shell auto completion, you may specify all namespaces with a leading `/` when invoking from the command line. It will be stripped before xrun runs them.

ie:

```bash
$ xrun /foo/bar
```

That way, you can press `tab` after the first `/` to get auto completion with namespaces.

### Namespace Overrides

Namespaces can be configured with priority and override relationships. A namespace searched earlier wins when two have a task of the same name.

```js
// namespace "test" is searched before namespace "build"
xrun.load({ namespace: "test", overrides: "build" }, tasks);

// a higher priority value is searched earlier
xrun.load("hot", tasks, 5);
```

- Each namespace starts with its `priority` (default `1`). A higher value is searched earlier.
- `overrides` is a namespace name or an array of names. A namespace is raised above every namespace it overrides.
- Namespaces with equal values keep load order.
- Calling `load` again for the same namespace adds to its `overrides`.
- Mutual overrides between two namespaces throw `circular namespace override`.

## Execution Context

A continuous execution context is maintained from the top whenever you invoke a task with `xrun <n>`.

The execution context is passed to any task function as the first parameter and as `this`. It has the following properties:

- `run` - a function to run another task, `run(tasks, callback?)`
- `argv` - arguments to the task (array)
- `cliCmd` - the CLI command object from argument parser
- `argp` - parsed arguments metadata (JSON format)
- `args` - parsed arguments list
- `argOpts` - parsed CLI options for the task (object)
- `err` - For the [`finally`](#finally-hook) hook, if task failed, this would be the error
- `failed` - The first task failure error, or `null`. Further errors are in its `more` array.

You can run more tasks under the same context with `this.run` or `context.run`:

- run a single task

  - `this.run("task_name")`
  - `context.run("task_name")`

- execute tasks serially.

  - `this.run(xrun.serial("name1", "name2", "name3"))`
  - `this.run([ ".", "name1", "name2", "name3"])`

- execute tasks concurrently
  - `this.run(["name1", "name2", "name3"])`

The tasks given to `run` start after the calling function finishes. The optional `callback(err, data)` is called when they complete.

For example:

```js
const tasks = {
  bar: {},
  foo: function(context) {
    console.log("hello from foo");
    context.run("bar");
  }
};
```

### Task Options

The execution context also has `argv` which is an array of the task options. The first one is the name as used to invoke the task.

Examples:

- `xrun foo` - argv: `["foo"]`
- `xrun foo --bar` - argv: `["foo", "--bar"]`
- `xrun ?foo --bar --woo` - argv: `["?foo", "--bar", "--woo"]`
- `xrun ?ns/foo --bar` - argv: `["?ns/foo", "--bar"]`

For a shell command task, the options after the task name, minus the task name itself, are appended to the command.

For a function task, `context.argOpts` holds the parsed options. Declare the options a task accepts with `argOpts` in the task object:

```js
const tasks = {
  foo: function(context) {
    console.log(context.argv, context.argOpts);
  },
  boo: {
    desc: "show argv from task options",
    argOpts: {
      level: { alias: "l", args: "<val string>", desc: "log level" },
      verbose: { alias: "v" }
    },
    task: function(context) {
      console.log(context.argv, context.argOpts);
    }
  }
};
```

- An option spec uses the `@fynjs/cli-args` format, ie: `{ alias, args, desc, required }`.
- These older forms are also accepted: `require: true`, `type: "string"` (also `number`, `boolean`, `float`, `int`, `integer`), `type: "array"`, `type: "count"`.
- Options not in `argOpts` are accepted by default. If `allowUnknownOption` is `false`, they fail the task with `Unknown options for task <name>: ...`.
- An option parsing error fails the task with `Error parsing options for task <name>: ...`.

#### Inline Task Options

Task options can be specified inline in the task definition also, not just in command line.

Only the first part separated by space `" "` is used as the task name.

For example,

```js
const tasks = {
  foo: function(context) {
    console.log(context.argv);
  },
  zoo: "foo --bar --woo",
  moo: ["?bad", "foo --bar --woo"]
};
```

### Accessing Arguments

Options written after a task name on the command line are parsed for that task:

```js
const tasks = {
  test: function(context) {
    console.log("Parsed options:", context.argOpts);
    // If called with: xrun test --watch --verbose
    // context.argOpts would be: { watch: true, verbose: true }
  }
};
```

The `--` remainder is not part of the context. It is only appended to a shell command, see [Argument Passing](#argument-passing).

## Error Handling

### Environment Variables

xrun sets these environment variables for shell commands:

- `XRUN_ERR` - If task failed, this contains the error message
- `XRUN_FAILED` - If any task failed, this is set to `true`

These are particularly useful in [finally hooks](#finally-hook) for cleanup based on execution results.

The `xrun` command sets or reads these variables in `process.env`:

| Variable | Behavior |
| --- | --- |
| `XRUN_ID` | Set to `1`, or incremented when xrun runs inside another xrun. |
| `FORCE_COLOR` | Set to `1` if not already set. |
| `XRUN_QUIET` | `1` means quiet. Set by `qrun` and by `--quiet`. Read when `--quiet` is not given. |
| `XRUN_CWD` | CWD of the run. |
| `XRUN_INIT_CWD` | CWD at first invocation. Becomes `INIT_CWD` for npm scripts. |
| `XRUN_VERSION`, `XRUN_BIN_DIR`, `XRUN_NODE_BIN` | Version, install directory and node binary of the running xrun. Used to skip repeated logs in nested runs. |
| `XRUN_TASKFILE` | Path of the loaded task file, or `not found`. |
| `XRUN_PACKAGE_PATH` | Path of the `package.json` whose npm scripts were loaded. |

### Stop on Error Modes

xrun supports different error handling modes via the `stopOnError` setting:

- `false` or `""` - Continue execution even if tasks fail
- `"soft"` - Allow existing async tasks to complete, but don't start new tasks
- `"full"` - Stop immediately and abandon all pending tasks (default)

```js
// Set globally
const xrun = require("@fynjs/run");
xrun.stopOnError = "soft";

// Or via CLI
// xrun --soe=soft task1 task2
```

When the `xrun` command finishes with a failure and no `done` callback, it prints the errors and exits with code 1, but only if the mode is not `""`. With `--soe no`, the process is not exited with code 1 by xrun.

## APIs

All APIs are members of the `xrun` instance. Methods that return `this` can be chained.

### `stopOnError`

```ts
xrun.stopOnError: "" | "soft" | "full"
```

Configure `xrun`'s behavior if any task execution failed.

Accepted values when setting are:

- `false`, `""` - completely turn off, march on if any tasks failed.
- `"soft"` - Allow existing async tasks to run to completion and invoke `finally` hooks, but no new tasks will be executed.
- `true`, `"full"` - Stop and exit immediately, don't wait for any pending async tasks, `finally` hooks invocation is unreliable.

Any other value throws an assertion error. The getter returns `""`, `"soft"`, `"full"` or `undefined` if never set.

> If never set, `run` sets it to `"full"`.

Example:

```js
const xrun = require("@fynjs/run");

xrun.stopOnError = "full";
```

> Note: If user specify this in CLI with option `--soe=<value>` then that will always be used.

### `load([namespace], tasks, [priority])`

```ts
xrun.load(tasks: object): this
xrun.load(namespace: string | { namespace: string; overrides?: string | string[] }, tasks: object, priority?: number): this
```

Load `tasks` into `[namespace]` (optional).

If no `namespace`, then tasks are loaded into the root namespace `/`.

- `tasks` must be an object, otherwise it throws `Invalid tasks`.
- Tasks are merged into the namespace with `Object.assign`. A task with the same name replaces the earlier one.
- `priority` defaults to `1`. See [Namespace Overrides](#namespace-overrides). It has no effect on the root namespace, which is always searched first.

```js
// Load into default namespace
xrun.load({
  hello: "echo hello"
});

// Load into specific namespace
xrun.load("build", {
  compile: "babel src -d lib",
  bundle: "webpack"
});

// Load with namespace options
xrun.load(
  { namespace: "test", overrides: "build" },
  {
    unit: "jest",
    e2e: "cypress run"
  }
);
```

### `run(tasks, [done])`

```ts
xrun.run(tasks: string | any[], done?: (err?: Error) => void): this
```

Run the task specified by `tasks`.

- `tasks` - Either a string or an array of names. A string may carry a `?` prefix, a namespace, and inline task options. An array follows the [array rules](#array-serialconcurrent-rules) and is concurrent unless it starts with a serial marker.
- `done` - Optional callback, called once with the first failure error, or nothing on success. Further failures are in `err.more`. If it's not given, an internal handler prints the failures and exits the process with code 1, see [Stop on Error Modes](#stop-on-error-modes).

If `stopOnError` was never set, it is set to `"full"`.

```js
// Run single task
xrun.run("build", err => {
  if (err) console.error("Build failed:", err);
  else console.log("Build completed");
});

// Run multiple tasks
xrun.run(["lint", "test"], done);
```

### `asyncRun(tasks)`

```ts
xrun.asyncRun(tasks: string | any[]): Promise<undefined>
```

Promise-based version of `run()`. It resolves with `undefined` and rejects with the same error `done` would receive.

```js
async function buildAndDeploy() {
  try {
    await xrun.asyncRun("build");
    await xrun.asyncRun("deploy");
    console.log("Build and deploy completed");
  } catch (err) {
    console.error("Failed:", err);
  }
}
```

### `stop()`

```ts
xrun.stop(): symbol
```

Returns a marker. It does nothing by itself. When xrun executes the marker as a task, it kills all tracked child processes and no further task or `finally` hook starts.

Use it as a task, or return it from a function task:

```js
const tasks = {
  "long-running-server": () => {
    // Start a server
    return new Promise(resolve => {
      // This would run indefinitely
      setInterval(() => {}, 1000);
    });
  },

  "test-and-stop": xrun.serial(
    "long-running-server",
    () => {
      // Run some tests
      return runTests();
    },
    () => xrun.stop() // Stop everything
  )
};
```

### `waitAllPending(done)`

```ts
xrun.waitAllPending(done: () => void): this
```

Wait for all pending concurrent tasks to complete and then call `done` with no arguments. It polls every 10 ms.

```js
xrun.run("background-task");
xrun.waitAllPending(() => {
  console.log("All tasks completed");
});
```

### `env(spec, [options])`

```ts
xrun.env(spec: Record<string, string | null | undefined>, options?: { override?: boolean }): XTaskSpec
```

Create a task to set environment variables in `process.env`.

- `spec` - Object of environment variables. A `null` or `undefined` value deletes the variable.
- `options.override` - Default `true`. When `false`, variables that already exist are kept.

Example:

```js
{
  someTask: [xrun.env({ FOO: "bar" }), xrun.exec("echo $FOO")];
}
```

> Note that this can be achieved easily with a function task:

```js
{
  someTask: [() => Object.assign(process.env, { FOO: "bar" }), xrun.exec("echo $FOO")];
}
```

> However, using `xrun.env` will log out the env variables and values nicely.

### `updateEnv(envValues, [options])`

```ts
xrun.updateEnv(envValues: Record<string, any>, options?: { target?: object; override?: boolean }): object
```

Immediately apply `envValues` to `options.target` (default `process.env`) and return the target. A `null` or `undefined` value deletes the key. `override` defaults to `true`. When `false`, existing keys are kept. This is the function behind [`env`](#envspec-options).

### `concurrent([tasks] | task1, task2, taskN)`

```ts
xrun.concurrent(...tasks: any[]): any[] | any
```

Explicitly creates an array of tasks to be executed concurrently.

- The tasks can be passed in as a single array
- Or they can be passed in as a list of variadic arguments
- Falsy arguments are dropped. With no arguments it throws `no tasks passed`.
- A single argument that is not an array is returned as is.

Returns an array of tasks that's marked for concurrent execution. `xrun.parallel` is an alias.

```js
// Using array
xrun.concurrent(["task1", "task2", "task3"]);

// Using variadic arguments
xrun.concurrent("task1", "task2", "task3");

// Nested example
const tasks = {
  "build-all": xrun.concurrent("build-client", "build-server", "build-docs")
};
```

### `serial([tasks] | task1, task2, taskN)`

```ts
xrun.serial(...tasks: any[]): any[] | any
```

Explicitly creates an array of tasks to be executed serially. Argument handling is the same as [`concurrent`](#concurrenttasks--task1-task2-taskn).

- The tasks can be passed in as a single array
- Or they can be passed in as a list of variadic arguments

Returns an array of tasks that's marked for serial execution.

```js
// Using array
xrun.serial(["build", "test", "deploy"]);

// Using variadic arguments
xrun.serial("build", "test", "deploy");

// Complex example
const tasks = {
  "ci-pipeline": xrun.serial(
    "clean",
    xrun.concurrent("lint", "typecheck"),
    "build",
    "test",
    "deploy"
  )
};
```

### `exec(spec, [options])`

```ts
xrun.exec(spec: string | string[] | ExecSpec, options?: string | string[] | Omit<ExecSpec, "cmd">): XTaskSpec

interface ExecSpec {
  cmd: string | string[];
  flags?: string | string[];
  execOptions?: object;
  xrun?: { delayRunMs?: number };
  env?: Record<string, string>;
}
```

Create a shell command task spec with _optional_ [`flags`](#shell-task-flags) or `options`.

- `spec` - an object that specifies the following fields:

| Field | Type | Default | Behavior |
| --- | --- | --- | --- |
| `cmd` | string, string[] | none | The shell command. An array is joined with a space. `command` is accepted as an alias. |
| `flags` | string, string[] | `{}` | [Shell Task Flags](#shell-task-flags), ie: `"tty,sync"` or `["tty", "sync"]`. |
| `execOptions` | object | `{}` | Options to pass to [child_process.spawn] or [child_process.exec]. |
| `xrun` | object | `{ delayRunMs: 0 }` | xrun execution options. `delayRunMs` is milliseconds to wait before running the command. |
| `env` | object | none | `Object.assign`ed into `execOptions.env`. It is added to `process.env` unless the `noenv` flag is set. |

> Alternatively this can also be called as `exec(cmd, [flags|options])`

Where:

- `flags` - string or array as [Shell Task Flags](#shell-task-flags)
- `options` - Object to specify: `{ flags, execOptions, xrun, env }`

Any other `spec` type throws `xrun.exec - unknown spec type`.

Examples:

```js
const xrun = require("@fynjs/run");

const tasks = {
  cmd1: xrun.exec("echo hello", "tty"),
  cmd2: [
    // run `echo foo` with env FOO=bar
    xrun.exec("echo foo", { env: { FOO: "bar" } }),
    // run `echo hello world` with tty enabled
    xrun.exec(["echo", "hello", "world"], "tty"),
    // with a single spec object
    xrun.exec({
      cmd: ["echo", "hello", "world"],
      flags: "tty",
      env: { FOO: "bar" }
    })
  ]
};

xrun.load(tasks);
```

### `printTasks()`

```ts
xrun.printTasks(): this
```

Print the loaded tasks and their descriptions to the console.

### `countTasks()` and `getNamespaces()`

```ts
xrun.countTasks(): number
xrun.getNamespaces(): string[]
```

`countTasks` returns the number of loaded tasks across all namespaces. `getNamespaces` returns the namespaces in search order, starting with `/`.

### `XRun`

```ts
new xrun.XRun(namespace?: string, tasks?: object)
```

The class behind the shared instance. Use it to create an independent runner with its own tasks. It extends `EventEmitter` and has the same methods as `xrun`. Its `load` and `run` are not pre-bound.

### Internal members

These are public on the instance but exist for the CLI and the executor. Do not call them from task code.

| Member | Behavior |
| --- | --- |
| `xqTree` | The execution queue tree. The executor creates and looks up queue items in it. |
| `addTaskChild(child, sym)`, `removeTaskChild(child, sym)` | Track or untrack a spawned child process under a symbol key. Both return the tracking map. |
| `killChildProcess(child)` | Kills one child. Uses `taskkill /T /F` on Windows, `child.kill()` elsewhere. Errors are ignored. Marks the child as stopped. |
| `killTaskChildren()` | After a 10 ms timer, kills every tracked child and clears the tracking map. |
| `actStop()` | Kills tracked children and marks the run as stopped. |
| `exit(code)` | Calls `process.exit(code)` only when `stopOnError` is set. With tracked children it kills them first and exits after 100 ms. Without `stopOnError` it does nothing. |
| `setCliContext(cliContext)`, `getCliContext()` | Set or get the CLI context. The CLI sets it before running tasks. `setCliContext` returns the instance. |

### Events

`xrun` is an `EventEmitter`. These events are emitted:

| Event | Data | When |
| --- | --- | --- |
| `run` | `{ name }` or `{ tasks }` | `run` was called. |
| `execute` | `{ type, qItem, ... }` | A task item executes. `type` is `lookup`, `serial-arr`, `concurrent-arr`, `env`, `shell` or `function`. |
| `dep` | `{ qItem }` | A task's `dep` is about to run. |
| `search` | `{ qItem, found }` | A task name without a namespace was found by searching namespaces. |
| `not-found` | error | An optional task was not found. |
| `spawn-async`, `done-async` | none, `{ name }` | A concurrent branch started or finished. |
| `done-item` | timing data | A task finished. |
| `warn-finally` | none | A `finally` hook exists and `stopOnError` is `"full"`. |
| `fail-cancel` | watch object | A pending task was cancelled by a failure. |

[child_process.spawn]: https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
[child_process.spawnsync]: https://nodejs.org/api/child_process.html#child_process_child_process_spawnsync_command_args_options
[child_process.exec]: https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
[node.js stream]: https://nodejs.org/api/stream.html

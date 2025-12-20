# Detail Reference

- [Detail Reference](#detail-reference)
  - [Command Line Interface](#command-line-interface)
    - [CLI Options](#cli-options)
    - [Task Execution](#task-execution)
    - [Argument Passing](#argument-passing)
    - [Array Tasks from Command Line](#array-tasks-from-command-line)
  - [Provider Packages](#provider-packages)
    - [Using Provider Packages](#using-provider-packages)
    - [Creating Provider Packages](#creating-provider-packages)
  - [TypeScript Support](#typescript-support)
  - [Package.json Configuration](#packagejson-configuration)
    - [Task Definition](#task-definition-in-packagejson)
    - [CLI Options](#cli-options-in-packagejson)
  - [Creating Tasks](#creating-tasks)
  - [Loading Tasks](#loading-tasks)
  - [Task Definition](#task-definition)
    - [Direct Action Task](#direct-action-task)
    - [A Task Object](#a-task-object)
    - [String](#string)
      - [String Array](#string-array)
    - [Array](#array)
      - [Anonymous String Shell Command](#anonymous-string-shell-command)
        - [Shell Task Flags](#shell-task-flags)
    - [Function](#function)
    - [Task Spec](#task-spec)
    - [Object](#object)
      - [finally hook](#finally-hook)
  - [Array serial/concurrent rules](#array-serialconcurrent-rules)
    - [Serially](#serially)
      - [Using serial API](#using-serial-api)
      - [top level](#top-level)
      - [First element dot](#first-element-dot)
      - [Concurrently](#concurrently)
  - [Namespace](#namespace)
    - [Auto Complete with namespace](#auto-complete-with-namespace)
    - [Namespace Overrides](#namespace-overrides)
  - [Execution Context](#execution-context)
    - [Task Options](#task-options)
      - [Inline Task Options](#inline-task-options)
    - [Accessing Arguments](#accessing-arguments)
  - [Error Handling](#error-handling)
    - [Environment Variables](#environment-variables)
    - [Stop on Error Modes](#stop-on-error-modes)
  - [APIs](#apis)
    - [`stopOnError`](#stoponerror)
    - [`load([namespace], tasks)`](#loadnamespace-tasks)
    - [`run(name, [done])`](#runname-done)
    - [`asyncRun(name)`](#asyncrunname)
    - [`stop()`](#stop)
    - [`waitAllPending(done)`](#waitallpendingdone)
    - [`env(spec)`](#envspec)
    - [`concurrent([tasks]|task1, task2, taskN)`](#concurrenttaskstask1-task2-taskn)
    - [`serial([tasks]|task1, task2, taskN)`](#serialtaskstask1-task2-taskn)
    - [`exec(spec)`](#execspec)

## Command Line Interface

### CLI Options

The `xrun` command supports various options to control execution behavior:

#### Basic Options

- `--help`, `-h` - Show help information
- `--serial`, `-s`, `-x` - Execute tasks serially instead of concurrently
- `--cwd <path>`, `-w <path>` - Set xrun's current working directory
- `--dir <path>`, `-d <path>` - Set directory to look for `xrun-tasks.js` (default is CWD)

#### Task and Namespace Options

- `--list [namespaces]`, `-l [namespaces]` - List task names from comma-separated namespaces (default: all)
- `--full`, `-f` - Show task names with namespace when listing (can be repeated for more detail)
- `--ns`, `-m` - List all namespaces

#### Execution Control

- `--npm`, `-n` - Load npm scripts into `npm` namespace (default: true, use `--no-npm` to disable)
- `--nmbin`, `-b` - Add `CWD/node_modules/.bin` to PATH (default: true)
- `--soe <mode>`, `-e <mode>` - Stop on error mode: `no`, `soft`, `full` (default: `full`)
- `--quiet`, `-q` - Suppress log output
- `--require <modules>`, `-r <modules>` - Require modules instead of loading task files

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
xrun pkg/build

# Optional task execution (won't fail if task not found)
xrun ?optional-task
```

### Argument Passing

Arguments after `--` are passed to shell commands:

```bash
# Arguments passed to the last shell task
xrun test -- --grep "specific test"
xrun build -- --watch --verbose
```

For JavaScript function tasks, arguments are available via the execution context:

```js
load({
  myTask(context) {
    console.log("Parsed options:", context.argOpts);
  }
});
```

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

## Provider Packages

Provider packages allow you to create reusable task libraries that can be shared across projects.

### Using Provider Packages

Provider packages are automatically loaded when:

1. You have no tasks loaded (automatic discovery)
2. You explicitly enable them by setting `loadProviderModules: true` in your `@fynjs/run` config

#### Installation and Configuration

1. Install the provider package:

```bash
npm install --save-dev @my-org/build-tasks
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
const { load } = require("@fynjs/run");
load({
  "my-custom-task": "echo hello"
});
```

### Creating Provider Packages

To create a provider package:

1. Create a module that exports a `loadTasks` function:

```js
// index.js of your provider package
const { load } = require("@fynjs/run");

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

2. Add keywords to your `package.json` for discoverability:

```json
{
  "name": "@my-org/build-tasks",
  "keywords": ["xarc-run", "xrun", "task-provider"],
  "main": "index.js"
}
```

## TypeScript Support

xrun supports TypeScript task files with automatic runtime detection.

### Supported Files

- `xrun-tasks.ts` - TypeScript task file
- `xrun-tasks.tsx` - TypeScript with JSX
- `xrun-tasks.mts` - TypeScript ES modules

### Runtime Requirements

Install one of the supported TypeScript runtimes:

```bash
# Recommended: tsx (faster, better ESM support)
npm install -D tsx typescript

# Alternative: ts-node
npm install -D ts-node typescript
```

### Example TypeScript Task File

```typescript
import { load, concurrent, serial, exec } from "@fynjs/run";

interface BuildOptions {
  production?: boolean;
  watch?: boolean;
}

const buildTask = (options: BuildOptions = {}) => {
  const mode = options.production ? "production" : "development";
  const watchFlag = options.watch ? "--watch" : "";
  return exec(`webpack --mode ${mode} ${watchFlag}`);
};

load({
  build: buildTask(),
  "build:prod": buildTask({ production: true }),
  "build:watch": buildTask({ watch: true }),

  test: concurrent(exec("jest"), exec("eslint src/")),

  ci: serial("test", "build:prod")
});
```

## Package.json Configuration

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

### CLI Options in Package.json

Default CLI options can be specified in `package.json`:

```json
{
  "@fynjs/run": {
    "npm": true,
    "nmbin": true,
    "loadProviderModules": true,
    "soe": "soft"
  }
}
```

Alternative configuration key `xrun` is also supported:

```json
{
  "xrun": {
    "npm": false,
    "serial": true
  }
}
```

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

Tasks can be loaded with `xrun.load`. You can specify a namespace for the tasks.

```js
const xrun = require("@fynjs/run");
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
- [Task Spec](#task-spec) - created using the [exec API](#execspeccmd-flagsoptions), as a shell command to run.

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

These environment variables are defined, mainly for the [`finally`](#finally-hook) hook:

- `XRUN_ERR` - If task failed, this contains the error message.
- `XRUN_FAILED` - If any task failed, this is set to `true`.

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

If the task is an array, then it can contain elements that are strings or functions.

- Functions are treated as a [task function](#function) to be called.
- Strings in a task array are primarily treated as name of another task to look up and execute.
- String started with `"~$"` are treated as [anonymous shell commands](#anonymous-string-shell-command) to be executed.

The [array serial/concurrent rules](#array-serialconcurrent-rules) will be applied.

```js
{
  foo: ["foo1", "foo2", "foo3"];
}
```

`xrun foo` will cause the three tasks `foo1`, `foo2`, `foo3` to be executed **_serially_**.

#### Anonymous String Shell Command

If the task name in a task array starts with `"~$"` then the rest of it is executed as an anonymous shell command directly.

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

- The leading part `~(tty)$` is specifying a shell command with flags `(tty)`.
- Multiple flags can be specified like this: `~(tty,sync)$`.

These are supported flags:

- `tty` - Use [child_process.spawn] to launch the shell command with TTY control. **WARNING** Only one task at a time can take over the TTY.
- `spawn` - Use [child_process.spawn] API instead of [child_process.exec] to launch the shell process. TTY control is not given.
- `sync` - If either `tty` or `spawn` flag exist, then use [child_process.spawnSync] API. This will cause concurrent tasks to wait.
- `noenv` - Do not pass `process.env` to child process.

### Function

```js
{
  foo: function (context) { return Promise.resolve("hello"); }
}
```

`xrun foo` will cause the function to be called.

The `this` context for the function will be the xrun [Execution Context](#execution-context). If you don't want to use `this`, then you can use arrow functions for your task.

The function can return:

- `Promise` - `xrun` will await for the promise.
- [node.js stream] - `xrun` will wait for the stream to end.
- `array` - `xrun` will treat the array as a list of tasks to be executed
  - The [array serial/concurrent rules](#array-serialconcurrent-rules) applied to the array.
  - The [anonymous shell command](#anonymous-string-shell-command) rule applied to each string element.
- `string` - `xrun` will treat the string as a task name or an [anonymous shell command to be executed](#anonymous-string-shell-command).
- `function` - `xrun` will call the function as another task function.
- `stream` - [TBD]
- `undefined` or anything else - `xrun` will wait for the `callback` to be called.

### Task Spec

A direct action task can also be defined as a task spec.

Right now the supported spec type is for running a shell command, created using the [exec API](#execspeccmd-flagsoptions)

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

- `desc` - Description for the task.
- `task` - Defines a [direct action task](#direct-action-task).
- `dep` - Dependency tasks to be executed first.
- `finally` - Defines a [direct action task](#direct-action-task) that's always run after task finish or fail.

#### finally hook

When defining task as an object, you can have a `finally` property that defines [direct action task](#direct-action-task) which is always executed after the task completes or fails. Generally for doing clean up chores.

Note that the finally hook is processed the same way as a task. Other tasks that are referenced by the `finally` hook will not have their `finally` hook invoked.

If you set `stopOnError` to `full`, then be careful if you have concurrent running tasks, because `full` stop immediately abandon all pending async sub tasks, but since xrun can't reliably cancel them, they could be continuing to run, and therefore could cause concurrent conflict with your finally hook.

If you have async task, it's best you set [`stopOnError`](#stoponerror) to `soft`.

## Array serial/concurrent rules

When you define a task as an array, it should contain a list of task names to be executed serially or concurrently.

Generally, the array of tasks is executed concurrently, and only serially when [certain conditions](#serially) are true.

An task array can also be explicitly created as concurrent using the [concurrent API](#concurrenttaskstask1-task2-taskn)

### Serially

Each task in the array is executed serially if one of the following is true:

- The array is defined at the [top level](#top-level).
- The array is created by the [serial API](#serialtaskstask1-task2-taskn).
- The first element of the array is [`"."`](#first-element-dot) **DEPRECATED** use the [serial API](#serialtaskstask1-task2-taskn) instead.

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

At top level, an array of task names will be executed serially.

```js
const tasks = {
  foo: ["foo1", "foo2", "foo3"];
};

xrun.load(tasks);
```

#### First element dot

> **DEPRECATED** - Please use the [serial API](serialtaskstask1-task2-taskn) instead.

If the first element of the array is `"."` then the rest of tasks in the array will be executed serially.

```js
{
  foo: ["bar", [".", "foo1", "foo2", "foo3"]];
}
```

#### Concurrently

By default, an ordinary array of tasks is executed concurrently, except when it's defined at the [top level](#top-level)

If you need to have an array of tasks at the top level to execute concurrently, use the [concurrent API](concurrenttaskstask1-task2-taskn) to create it.

```js
const xrun = require("@fynjs/run");

const tasks = {
  foo: xrun.concurrent("foo1", "foo2", "foo3");
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

If you run a task without specifying the namespace, then it's searched through all namespaces until it's found. The default namespace is the first one to search. The search is done in the order the namespaces were loaded.

> For obvious reasons, this means task names cannot contain `/`.

### Auto Complete with namespace

To assist auto completion when using [@fynjs/run-cli], you may specify all namespaces with a leading `/` when invoking from the command line. It will be stripped before xrun run them.

ie:

```bash
$ xrun /foo/bar
```

That way, you can press `tab` after the first `/` to get auto completion with namespaces.

### Namespace Overrides

Namespaces can be configured with priority and override relationships:

```js
// Load with explicit priority (lower number = higher priority)
xrun.load({ namespace: "build", overrides: "default" }, tasks, 0);

// This will be searched before the default namespace
```

The override system allows you to control the order in which namespaces are searched for tasks.

## Execution Context

A continuous execution context is maintained from the top whenever you invoke a task with `xrun <n>`.

The execution context is passed to any task function as the first parameter and as `this`. It has the following properties:

- `run` - a function to run another task
- `argv` - arguments to the task (array)
- `cliCmd` - the CLI command object from argument parser
- `argp` - parsed arguments metadata (JSON format)
- `args` - parsed arguments list
- `argOpts` - parsed CLI options for the task (object)
- `err` - For the [`finally`](#finally-hook) hook, if task failed, this would be the error
- `failed` - The array of all task failure errors

You can run more tasks under the same context with `this.run` or `context.run`:

- run a single task

  - `this.run("task_name")`
  - `context.run("task_name")`

- execute tasks serially.

  - `this.run(xrun.serial("name1", "name2", "name3"))`
  - `this.run([ ".", "name1", "name2", "name3"])`

- execute tasks concurrently
  - `this.run(["name1", "name2", "name3"])`

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

The argv is only applicable if the task is a JavaScript `function`.

For example:

```js
const tasks = {
  foo: function(context) {
    console.log(context.argv);
  },
  boo: {
    desc: "show argv from task options",
    task: function(context) {
      console.log(context.argv);
    }
  }
};
```

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

Arguments passed after `--` on the command line are available in the execution context:

```js
const tasks = {
  test: function(context) {
    console.log("Parsed options:", context.argOpts);
    // If called with: xrun test --watch --verbose
    // context.argOpts would be: { watch: true, verbose: true }
  }
};
```

For shell commands, arguments passed after `--` are automatically appended to the last shell task from the CLI.

## Error Handling

### Environment Variables

xrun sets these environment variables for shell commands:

- `XRUN_ERR` - If task failed, this contains the error message
- `XRUN_FAILED` - If any task failed, this is set to `true`

These are particularly useful in [finally hooks](#finally-hook) for cleanup based on execution results.

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

## APIs

`xrun` supports the following methods:

### `stopOnError`

Configure `xrun`'s behavior if any task execution failed.

Accepted values are:

- `false`, `""` - completely turn off, march on if any tasks failed.
- `"soft"` - Allow existing async tasks to run to completion and invoke `finally` hooks, but no new tasks will be executed.
- `true`, `"full"` - Stop and exit immediately, don't wait for any pending async tasks, `finally` hooks invocation is unreliable.

> xrun defaults this to `"full"`

Example:

```js
const xrun = require("@fynjs/run");

xrun.stopOnError = "full";
```

> Note: If user specify this in CLI with option `--soe=<value>` then that will always be used.

### `load([namespace], tasks)`

Load `tasks` into `[namespace]` (optional).

If no `namespace`, then tasks are loaded into the root namespace.

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

### `run(name, [done])`

Run the task specified by `name`.

- `name` - Either a string or an array of names.
- `done` - Optional callback. If it's not given, then an internal handler is invoked to do `console.log` of the execution result.

```js
// Run single task
xrun.run("build", err => {
  if (err) console.error("Build failed:", err);
  else console.log("Build completed");
});

// Run multiple tasks
xrun.run(["lint", "test"], done);
```

### `asyncRun(name)`

Promise-based version of `run()`.

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

Gracefully stop all pending task execution.

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

Wait for all pending tasks to complete and then call `done`.

```js
xrun.run("background-task");
xrun.waitAllPending(() => {
  console.log("All tasks completed");
});
```

### `env(spec)`

Create a task to set environment variables in `process.env`.

- `spec` - Object of environment variables.

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

### `concurrent([tasks]|task1, task2, taskN)`

Explicitly creates an array of tasks to be executed concurrently.

- The tasks can be passed in as a single array
- Or they can be passed in as a list of variadic arguments

Returns an array of tasks that's marked for concurrent execution.

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

### `serial([tasks]|task1, task2, taskN)`

Explicitly creates an array of tasks to be executed serially.

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

### `exec(spec)`

Create a shell command task spec with _optional_ [`flags`](#shell-task-flags) or `options`.

- `spec` - an object that specifies the following fields:

  - `cmd` - A string, or an array of strings to be combined into a single one with `join(" ")`, to use as the shell command
  - `flags` - [Shell Task Flags](#shell-task-flags), can be specified as:
    - **string** - ie: `"tty,sync"`
    - **array** - ie: `["tty", "sync"]`
  - `execOptions` - options to pass to [child_process.spawn] or [child_process.exec]
  - `xrun` - Object as options for xrun execution
    - `delayRunMs` - milliseconds to wait before actually running the command
  - `env` - Object of environment flags to set. It is actually `Object.assign`ed into `execOptions.env`.

> Alternatively this can also be called as `exec(cmd, [flags|options])`

Where:

- `flags` - string or array as [Shell Task Flags](#shell-task-flags)
- `options` - Object to specify: `{ flags, execOptions, xrun, env }`

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

[npm scripts]: https://docs.npmjs.com/misc/scripts
[@fynjs/run-cli]: https://github.com/jchip/@fynjs/run-cli
[bash]: https://www.gnu.org/software/bash/
[zsh]: http://www.zsh.org/
[child_process.spawn]: https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
[child_process.spawnsync]: https://nodejs.org/api/child_process.html#child_process_child_process_spawnsync_command_args_options
[child_process.exec]: https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
[node.js stream]: https://nodejs.org/api/stream.html

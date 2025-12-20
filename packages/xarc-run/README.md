[![NPM version][npm-image]][npm-url] [![Build Status][ci-shield]][ci-url]
[![Dependency Status][daviddm-image]][daviddm-url] [![devDependency Status][daviddm-dev-image]][daviddm-dev-url]
[![coverage][coverage-image]][coverage-url]

# @fynjs/run

`npm run` enhanced - A powerful task runner and build tool for modern JavaScript projects.

- **Compatible** with `npm run` for [npm scripts]
- **Concurrent & Serial** execution of tasks
- **JavaScript extensibility** with functions and promises
- **Provider packages** for reusable task libraries
- **TypeScript support** with automatic tsx or ts-node integration
- **Advanced CLI** with argument parsing and remaining args support
- **Namespace organization** for better task management
- and [more](#full-list-of-features)

## Running [npm scripts]

This module provides a command `xrun` to run all your [npm scripts] in `package.json`.

And you can run multiple of them **concurrently** or **serially**.

Some examples below:

| what you want to do                 | npm command    | `xrun` command            |
| ----------------------------------- | -------------- | ------------------------- |
| run `test`                          | `npm run test` | `xrun test`               |
| run `lint` and `test` concurrently  | N/A            | `xrun lint test`          |
| run `lint` and then `test` serially | N/A            | `xrun --serial lint test` |

Alias for the options:

- `-s`: `--serial`

## Running JavaScript tasks

You can write your tasks in JavaScript and run them with `xrun`.

> This is useful when a shell script is too long to fit in a JSON string, or when it's not easy to do something with shell script.

These APIs are provided: `concurrent`, `serial`, `exec`, `env`, and `load`.

Put your tasks in a file `xrun-tasks.js` and `xrun` will load it automatically.

An example `xrun-tasks.js`:

```js
const { load, exec, concurrent, serial } = require("@fynjs/run");
load({
  //
  // define a task hello, with a string definition
  // because a string is the task's direct value, it will be executed as a shell command.
  //
  hello: "echo hello",
  //
  // define a task world, using a JavaScript function to print something
  //
  world: () => console.log("world"),
  //
  // define a task serialTask, that will execute the three tasks serially, first two are
  // the hello and world tasks defined above, and 3rd one is a shell command defined with exec.
  // because the 3rd one is not a direct value of a task, it has to use exec to define a shell command.
  //
  serialTask: serial("hello", "world", exec("echo hi from exec")),
  //
  // define a task concurrentTask, that will execute the three tasks concurrently
  //
  concurrentTask: concurrent("hello", "world", exec("echo hi from exec")),
  //
  // define a task nesting, that does complex nesting of concurrent/serial constructs
  //
  nesting: concurrent(serial("hello", "world"), serial("serialTask", concurrent("hello", "world")))
});
```

To run the tasks defined above from the command prompt, below are some examples:

| what you want to do                   | command                     |
| ------------------------------------- | --------------------------- |
| run `hello`                           | `xrun hello`                |
| run `hello` and `world` concurrently  | `xrun hello world`          |
| run `hello` and then `world` serially | `xrun --serial hello world` |

### `exec` and shell scripts

Use `exec` to invoke a shell command from JavaScript.

Here are some examples:

| shell script in JSON string | shell script using `exec` in JavaScript          | note                         |
| --------------------------- | ------------------------------------------------ | ---------------------------- |
| `echo hello`                | `exec("echo hello")`                             |                              |
| `FOO=bar echo hello $FOO`   | `exec("FOO=bar echo hello $FOO")`                |                              |
| `echo hello && echo world`  | `exec("echo hello && echo world")`               |                              |
| `echo hello && echo world`  | `serial(exec("echo hello"), exec("echo world"))` | using serial instead of `&&` |

- `exec` supports `options` that can set a few things. Some examples below:

| what you want to do                   | shell script using `exec` in JavaScript                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| setting an env variable               | `exec("echo hello $FOO", {env: {FOO: "bar"}})`                     |
| provide tty to the shell process      | `exec("echo hello", {flags: "tty"})`                               |
| using spawn with tty, and setting env | `exec("echo hello $FOO", {flags: "tty,spawn", env: {FOO: "bar"}})` |

### Function tasks

A task in JavaScript can be just a function.

```js
load({
  hello: () => console.log("hello")
});
```

A function task can do a few things:

- Return a promise or be an async function, and `xrun` will wait for the Promise.
- Return a stream and `xrun` will wait for the stream to end.
- Return another task for `xrun` to execute further.
- Access parsed options with `context.argOpts`.

Example:

```js
load({
  // A function task named hello that access parsed options with `context.argOpts`
  async hello(context) {
    console.log("hello argOpts:", context.argOpts);
    return ["foo"];
  },
  h2: ["hello world"],
  foo: "echo bar"
});
```

### Running tasks with `concurrent` and `serial`

Use `concurrent` and `serial` to define a task that run multiple other tasks **concurrently** or **serially**.

Some examples:

- To do the same thing as the shell script `echo hello && echo world`:

```js
serial(exec("echo hello"), exec("echo world"));
```

- or concurrently:

```js
concurrent(exec("echo hello"), exec("echo world"));
```

- You can specify any valid tasks:

```js
serial(
  exec("echo hello"),
  () => console.log("world"),
  "name-of-a-task",
  concurrent("task1", "task2")
);
```

### Tasks to set `process.env`

`env` allows you to create a task to set variables in `process.env`.

You use it by passing an object of env vars, like `env({VAR_NAME: "var-value"})`

Examples:

```js
load({
  setEnv: serial(env({ FOO: "bar" }), () => console.log(process.env.FOO))
});
```

### And to put it all together

A popular CI/CD use case is to start servers and then run tests, which can be achieved using `xrun` JavaScript tasks:

```js
const { concurrent, serial, load, stop } = require("@fynjs/run");
const waitOn = require("wait-on");

const waitUrl = url => waitOn({ resources: [url] });

load({
  "start-server-and-test": concurrent(
    // start the servers concurrently
    concurrent("start-mock-server", "start-app-server"),
    serial(
      // wait for servers concurrently, and then run tests
      concurrent("wait-mock-server", "wait-app-server"),
      "run-tests",
      // Finally stop servers and exit.
      // This is only needed because there are long running servers.
      () => stop()
    )
  ),
  "start-mock-server": "mock-server",
  "start-app-server": "node lib/server",
  "wait-mock-server": () => waitUrl("http://localhost:8000"),
  "wait-app-server": () => waitUrl("http://localhost:3000"),
  "run-tests": "cypress run --headless -b chrome"
});
```

> `xrun` adds `node_modules/.bin` to PATH. That's why `npx` is not needed to run commands like `cypress` that's installed in `node_modules`.

### Provider Packages

`@fynjs/run` supports **provider packages** - reusable task libraries that can be shared across projects. This allows teams to standardize common build tasks and workflows.

#### What makes a provider package?

A provider package is identified by either:

1. Having `xrunProvider` config in its `package.json`
2. Having `@fynjs/run` as a dependency

#### Creating a provider package

```js
// In your provider package's package.json
{
  "name": "my-build-tasks",
  "xrunProvider": {
    "module": "tasks.js"  // optional: specify which module exports loadTasks
  }
}
```

```js
// In your provider's tasks.js (or main module)
module.exports = {
  loadTasks(xrun) {
    // can pass in optional namespace with xrun.load("namespace", {...})
    return xrun.load({
      build: "webpack --mode=production",
      test: "jest",
      lint: "eslint src/",
      ci: ["lint", "test", "build"]
    });
  }
};
```

#### Using provider packages

Provider packages are automatically loaded when:

1. You have no tasks loaded (automatic discovery)
2. You explicitly enable them by setting `loadProviderModules: true` in your `@fynjs/run` config

Provider tasks are loaded from:

- `dependencies`
- `devDependencies`
- `optionalDependencies`

Example `package.json`:

```json
{
  "name": "my-app",
  "dependencies": {
    "my-build-tasks": "^1.0.0"
  },
  "@fynjs/run": {
    "loadProviderModules": true
  }
}
```

Now you can run provider tasks directly:

```bash
xrun build    # runs the build task from my-build-tasks
xrun ci       # runs the ci task which executes lint, test, build serially
```

### Shorthands

Not a fan of full API names like `concurrent`, `serial`, `exec`? You can skip them.

- `concurrent`: Any array of tasks are concurrent, except when they are specified at the top level.
- `exec`: Any string starting with `~$` are treated as shell script.
- `serial`: An array of tasks specified at the top level is executed serially.

Example:

```js
load({
  executeSerially: ["task1", "task2"], // top level array serially
  concurrentArray: [["task1", "task2"]], // Any other array (the one within) are concurrent
  topLevelShell: "echo hello", // top level string is a shell script
  shellScripts: [
    "~$echo hello", // any string started with ~$ is shell script
    "~(tty,spawn)$echo hello" // also possible to specify tty and spawn flag between ~ and $
  ]
});
```

## Full List of Features

- **Core Execution Engine**

  - Serial and concurrent task execution with proper nesting hierarchy
  - Promise, [node.js stream], or callback support for JavaScript tasks
  - Run time flow control - return further tasks to execute from JS task functions
  - Tasks can have a [_finally_](./REFERENCE.md#finally-hook) hook that always runs after task finish or fail

- **Developer Experience**

  - Compatible with and loads npm scripts from `package.json`
  - Auto completion for [bash] and [zsh]
  - TypeScript support with automatic tsx/ts-node loading (tsx preferred)
  - Advanced CLI with comprehensive options (see [CLI reference](./REFERENCE.md#cli-options))
  - Argument parsing with `--` remaining args support
  - Specify complex task execution patterns from command line

- **Extensibility & Organization**

  - **Provider packages** - reusable task libraries for sharing common workflows
  - **[Namespaces](./REFERENCE.md#namespace)** for organizing tasks across modules
  - Define tasks in JavaScript files with full programmatic control
  - Support [flexible function tasks](./REFERENCE.md#function) that can return more tasks to run
  - Custom task execution reporters

- **Advanced Features**
  - TTY control for interactive commands
  - Environment variable management with `env()` tasks
  - Shell command execution with `exec()` and spawn options
  - Task dependency resolution and execution planning

## Getting Started

Still reading? Maybe you want to take it for a test drive?

## A Simple Example

Here is a simple sample.

1. First setup the directory and project:

```bash
mkdir xrun-test
cd xrun-test
npm init --yes
npm install rimraf @fynjs/run
```

2. Save the following code to `xrun-tasks.js`:

```js
"use strict";
const { load } = require("@fynjs/run");

const tasks = {
  hello: "echo hello world", // a shell command to be exec'ed
  jsFunc() {
    console.log("JS hello world");
  },
  both: ["hello", "jsFunc"] // execute the two tasks serially
};

// Load the tasks into @fynjs/run
load(tasks);
```

3. And try one of these commands:

| what to do                            | command                      |
| ------------------------------------- | ---------------------------- |
| run the task `hello`                  | `xrun hello`                 |
| run the task `jsFunc`                 | `xrun jsFunc`                |
| run the task `both`                   | `xrun both`                  |
| run `hello` and `jsFunc` concurrently | `xrun hello jsFunc`          |
| run `hello` and `jsFunc` serially     | `xrun --serial hello jsFunc` |

## A More Complex Example

Here is a more complex example to showcase a few more features:

```js
"use strict";

const util = require("util");
const { exec, concurrent, serial, env, load } = require("@fynjs/run");
const rimraf = util.promisify(require("rimraf"));

const tasks = {
  hello: "echo hello world",
  jsFunc() {
    console.log("JS hello world");
  },
  both: {
    desc: "invoke tasks hello and jsFunc in serial order",
    // only array at top level like this is default to serial, other times
    // they are default to concurrent, or they can be marked explicitly
    // with the serial and concurrent APIs (below).
    task: ["hello", "jsFunc"]
  },
  // invoke tasks hello and jsFunc concurrently as a simple concurrent array
  both2: concurrent("hello", "jsFunc"),
  shell: {
    desc: "Run a shell command with TTY control and set an env",
    task: exec({ cmd: "echo test", flags: "tty", env: { foo: "bar" } })
  },
  babel: exec("babel src -D lib"),
  // serial array of two tasks, first one to set env, second to invoke the babel task.
  compile: serial(env({ BABEL_ENV: "production" }), "babel"),
  // more complex nesting serial/concurrent tasks.
  build: {
    desc: "Run production build",
    task: serial(
      () => rimraf("dist"), // cleanup, (returning a promise will be awaited)
      env({ NODE_ENV: "production" }), // set env
      concurrent("babel", exec("webpack")) // invoke babel task and run webpack concurrently
    )
  }
};

load(tasks);
```

## Install Globally

If you'd like to get the command `xrun` globally, you can install this module globally.

```bash
$ npm install -g @fynjs/run
```

However, it will still try to `require` and use the copy from your `node_modules` if you installed it.

## Load and Run Tasks Programmatically

If you don't want to use the CLI, you can load and invoke tasks in your JavaScript code using the `run` API.

Example:

```js
const { run, load, concurrent } = require("@fynjs/run");
const myTasks = require("./tools/tasks");

load(myTasks);
// assume task1 and task2 are defined, below will run them concurrently
run(concurrent("task1", "task2"), err => {
  if (err) {
    console.log("run tasks failed", err);
  } else {
    console.log("tasks completed");
  }
});
```

> Promise version of `run` is `asyncRun`

## TypeScript

Name your task file `xrun-tasks.ts` if you want to use TypeScript.

You need to install a TypeScript runtime to your `node_modules`. `@fynjs/run` supports both [tsx](https://www.npmjs.com/package/tsx) (recommended) and [ts-node](https://www.npmjs.com/package/ts-node):

```bash
# Recommended: tsx (faster, better ESM support)
npm install -D tsx typescript

# Alternative: ts-node
npm install -D ts-node typescript
```

`xrun` automatically detects and loads the appropriate TypeScript runtime when it finds `xrun-tasks.ts`, `xrun-tasks.tsx`, or `xrun-tasks.mts` files. It tries `tsx` first, then falls back to `ts-node/register`.

## Command Line Usage

Any task can be invoked with the command `xrun`:

```bash
$ xrun task1 [task1 options] [<task2> ... <taskN>]
```

ie:

```bash
$ xrun build
```

### Passing Arguments to Tasks

You can pass arguments after `--` to shell commands. These arguments are automatically appended to the last shell task:

```bash
$ xrun build -- --watch --verbose
$ xrun test -- --grep "specific test"
```

For JavaScript function tasks, parsed options are available via the `context` param:

It's also pass as the `this` context for the function.

```js
load({
  myTask(context) {
    console.log("Parsed options:", context.argOpts);
  }
});
```

### CLI Options

Common CLI options include:

- `--serial`, `-s` - Execute tasks serially instead of concurrently
- `--cwd <path>`, `-w` - Set working directory
- `--list`, `-l` - List available tasks
- `--npm`, `-n` - Load npm scripts (default: true)
- `--quiet`, `-q` - Suppress output
- `--soe <mode>`, `-e` - Stop on error mode: `no`, `soft`, `full`

For complete CLI reference:

```bash
$ xrun -h
```

See [CLI Options](./REFERENCE.md#cli-options) for full details.

To load [npm scripts] into the `npm` namespace, use the `--npm` option:

This is enabled by default. To turn it off use `--no-npm` option.

```bash
$ xrun --npm test
```

You can also specify command line options under `@fynjs/run` in your `package.json`.

### Specifying Complex Tasks from command line

- You can specify your tasks as an array from the command line.  For example, to have `xrun` execute the tasks `[task_a, task_b]` concurrently:

```bash
$ xrun [task_a, task_b]
$ xrun --concurrent [task_a, task_b]
```

- You can also execute them serially with:

```bash
$ xrun [--serial, task_a, task_b]
$ xrun --serial [task_a, task_b]
```

- You can execute tasks serially, and then an inner array with concurrent tasks. The following will execute `task_a`, then `task_b`, and finally `task_c1` and `task_c2` concurrently

```bash
$ xrun --serial [task_a, task_b, [task_c1, task_c2]]
```

- You can also make inner arrays serial using `--serial` as the first element.  Other shortcuts for "--serial" are: `.` and `-s`.

```bash
$ xrun [task_a, task_b, [--serial, task_c1, task_c2]]
```

- You can pass the whole array in as a single string, which will be parsed as an array with string elements only.

```bash
$ xrun "[task_a, task_b, [task_c1, task_c2]]"
```

## Task Name

Task name is any alphanumeric string that does not contain `/`, or starts with `?` or `~$`.

Tasks can be invoked from command line:

- `xrun foo/task1` indicates to execute `task1` in namespace `foo`
- `xrun ?task1` or `xrun ?foo/task1` indicates that executing `task1` is optional.

`xrun` treats these characters as special:

- `/` as namespace separator
- prefix `?` to let you indicate that the execution of a task is optional so it won't fail if the task is not found.
- prefix `~$` to indicate the task to be a string as a shell command

## Optional Task Execution

By prefixing the task name with `?` when invoking, you can indicate the execution of a task as optional so it won't fail in case the task is not found.

For example:

- `xrun ?foo/task1` or `xrun ?task1` won't fail if `task1` is not found.

## Task Definition

A task can be `string`, `array`, `function`, or `object`. See [reference](./REFERENCE.md#task-definition) for details.

## package.json

You can define @fynjs/run tasks and options in your `package.json`.

## Tasks

You can also define **xrun** tasks without JavaScript capability in your `package.json`.

They will be loaded into a namespace `pkg`.

For example:

```js
{
  "name": "my-app",
  "@fynjs/run": {
    "tasks": {
      "task1": "echo hello from package.json",
      "task2": "echo hello from package.json",
      "foo": ["task1", "task2"]
    }
  }
}
```

And you can invoke them with `xrun pkg/foo`, or `xrun foo` if there are no other namespace with a task named `foo`.

## Options

Command line options can also be specified under `@fynjs/run` or `xrun` inside your `package.json`.

For example:

```js
{
  "name": "my-app",
  "@fynjs/run": {
    "npm": true
  }
}
```

## Async Tasks

You can provide a JS function for a task that executes asynchronously. Your function just need to take a callback or return a Promise or a [node.js stream].

ie:

```js
const tasks = {
  cb_async: (cb) => {
    setTimeout(cb, 10);
  },
  promise_async: () => {
    return new Promise(resolve => {
      setTimeout(resolve, 10);
    }
  }
}
```

## Detailed Reference

See [reference](./REFERENCE.md) for more detailed information on features such as [load tasks into namespace], and setup [auto complete with namespace] for your shell.

## License

Licensed under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0)

[ci-shield]: https://travis-ci.org/electrode-io/xarc-run.svg?branch=master
[ci-url]: https://travis-ci.org/electrode-io/xarc-run
[npm-image]: https://badge.fury.io/js/%40xarc%2Frun.svg
[npm-url]: https://npmjs.org/package/@fynjs/run
[daviddm-image]: https://david-dm.org/electrode-io/xarc-run/status.svg
[daviddm-url]: https://david-dm.org/electrode-io/xarc-run
[daviddm-dev-image]: https://david-dm.org/electrode-io/xarc-run/dev-status.svg
[daviddm-dev-url]: https://david-dm.org/electrode-io/xarc-run?type=dev
[npm scripts]: https://docs.npmjs.com/misc/scripts
[@fynjs/run-cli]: https://github.com/electrode-io/xarc-run-cli
[bash]: https://www.gnu.org/software/bash/
[zsh]: http://www.zsh.org/
[load tasks into namespace]: REFERENCE.md#loading-task
[auto complete with namespace]: REFERENCE.md#auto-complete-with-namespace
[npm]: https://www.npmjs.com/package/npm
[node.js stream]: https://nodejs.org/api/stream.html
[coverage-image]: https://coveralls.io/repos/github/electrode-io/xarc-run/badge.svg?branch=master
[coverage-url]: https://coveralls.io/github/electrode-io/xarc-run?branch=master

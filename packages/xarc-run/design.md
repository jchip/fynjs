# @xarc/run Design Document

## Project Overview

**@xarc/run** (also known as `xrun`) is a sophisticated JavaScript task runner that serves as an enhanced alternative to `npm run`. It's designed to manage and execute tasks both concurrently and serially, with extensive support for JavaScript-based task definitions, TypeScript integration, and provider package ecosystems.

### Core Purpose

- Enhanced replacement for `npm run` with concurrent/serial execution capabilities
- JavaScript-first task definition system with full TypeScript support
- Complex workflow orchestration for build systems and CI/CD pipelines
- Unified interface for shell commands, JavaScript functions, and npm scripts
- Extensible provider package ecosystem for reusable task libraries
- Clean separation between CLI parsing and task execution

## Architecture Overview

### Core Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CLI Layer     │    │   Core Library   │    │   Task System   │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │ bin/xrun.js │ │───>│ │ xrun-instance│ │───>│ │   XQtor     │ │
│ │ cli/xrun.js │ │    │ │ xrun.js      │ │    │ │ (Executor)  │ │
│ │ CliContext  │ │    │ │ CliContext   │ │    │ │             │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Provider System │    │   Support Libs   │    │   Task Types    │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │ Auto-discover││    │ │ XQTree       │ │    │ │ Functions   │ │
│ │ Task Loading│ │    │ │ XQItem       │ │    │ │ Strings     │ │
│ │ TS Runtime  │ │    │ │ XTaskSpec    │ │    │ │ Arrays      │ │
│ │ npm Scripts │ │    │ │ Reporters    │ │    │ │ Objects     │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ │ TypeScript  │ │
└─────────────────┘    └──────────────────┘    │ └─────────────┘ │
                                               └─────────────────┘
```

### Key Architecture Patterns

1. **Task Executor Pattern**: Central XQtor manages a stack-based execution model
2. **Plugin Architecture**: Extensible reporters, task type handlers, and provider packages
3. **Tree Structure**: Tasks organized in execution trees with parent-child relationships
4. **Event-Driven**: Extensive event emission for monitoring and debugging
5. **Promise/Callback Hybrid**: Support for both async/await and callback patterns
6. **Provider Package System**: Extensible task library ecosystem with auto-discovery

## Core Features

### 1. Task Execution Models

#### **Concurrent Execution**

- Tasks run simultaneously using `Insync.parallel`
- Each concurrent task gets its own XQtor instance
- Resource sharing through shared execution context

#### **Serial Execution**

- Tasks execute sequentially in defined order
- Automatic error propagation stops execution on failure
- Stack-based execution with proper cleanup

#### **Mixed Patterns**

- Complex nesting of concurrent and serial constructs
- Dynamic task resolution at runtime
- Dependency-driven execution ordering

### 2. Task Definition Types

#### **String Tasks (Shell Commands)**

```javascript
{
  build: "npm run webpack",
  deploy: "rsync -av dist/ server:/var/www/"
}
```

Features:

- Direct shell command execution
- Environment variable passing
- Anonymous shell commands with `~$` prefix
- Shell flags: `~(tty,spawn,sync)$command`

#### **Function Tasks (JavaScript)**

```javascript
{
  process: async context => {
    console.log("Task args:", context.argv);
    console.log("Parsed options:", context.argOpts); // Parsed CLI options
    return ["build", "test"]; // Can return more tasks
  };
}
```

Features:

- Async/await support with Promise handling
- Stream handling with automatic completion detection
- Full context access (argv, argOpts, environment, CLI context)
- Return values become new tasks (arrays, strings, functions)
- Access to CLI arguments passed after `--` delimiter

#### **Array Tasks (Sequences)**

```javascript
{
  ci: ["lint", "test", "build"],           // Serial by default
  parallel: [".", "test1", "test2"],       // Concurrent with "." prefix
  mixed: ["."], ["task1", [".", "a", "b"]] // Complex nesting
}
```

Features:

- Serial execution by default
- Concurrent with special prefixes
- Anonymous functions and shell commands
- Nested array support

#### **Task Objects (Advanced)**

```javascript
{
  integration: {
    desc: "Integration test suite",
    dep: ["setup-db", "start-services"],
    task: ["run-tests"],
    finally: "cleanup-resources",
    options: { env: { NODE_ENV: "test" } }
  }
}
```

Features:

- Dependencies with `dep` field
- Finally hooks for cleanup
- Task descriptions
- Custom options and environment

### 3. Advanced Shell Features

#### **Shell Command Flags**

- `tty`: TTY control for interactive commands
- `spawn`: Use child_process.spawn instead of exec
- `sync`: Synchronous execution
- `noenv`: Don't inherit process.env
- `npm`: Special npm command handling

#### **Environment Management**

- Automatic environment variable inheritance
- Custom environment per task
- Error state variables (`XRUN_ERR`, `XRUN_FAILED`)
- npm command unwrapping

### 4. Provider Package System

Provider packages enable creation of reusable task libraries that can be shared across projects and teams.

#### **Package Discovery**

xrun automatically discovers provider packages when:

1. **No tasks are loaded** (automatic discovery when no xrun-tasks.js file found)
2. **Explicit configuration** via `loadProviderModules: true` in package.json

Provider packages are identified by:

1. **xrunProvider Configuration**: Packages with `xrunProvider` config in package.json
2. **Dependency Detection**: Packages with `@xarc/run` as a dependency

Discovery searches through `dependencies`, `devDependencies`, and `optionalDependencies`.

#### **Provider Package Structure**

```javascript
// package.json of provider package
{
  "name": "@my-org/build-tasks",
  "main": "index.js",
  "xrunProvider": {
    "module": "./tasks.js"  // Optional: custom entry point
  },
  "dependencies": {
    "@xarc/run": "^2.0.0"  // This identifies it as a provider
  }
}

// index.js or tasks.js
const { load } = require("@xarc/run");

function loadTasks(xrun) {
  const runner = xrun || require("@xarc/run");

  runner.load("build", {
    compile: "babel src -d lib",
    bundle: "webpack --mode production",
    clean: "rimraf lib dist"
  });
}

module.exports = { loadTasks };
```

#### **Configuration Control**

```json
{
  "@xarc/run": {
    "loadProviderModules": true // Enable provider loading
  }
}
```

### 5. TypeScript Integration

xrun provides first-class TypeScript support with automatic runtime detection and seamless integration.

#### **Supported File Types**

- `xrun-tasks.ts`: Standard TypeScript task files
- `xrun-tasks.tsx`: TypeScript with JSX support
- `xrun-tasks.mts`: TypeScript ES modules

#### **Runtime Detection**

xrun automatically detects and loads the appropriate TypeScript runtime:

1. **tsx** (recommended): Faster, better ESM support, no tsconfig.json required
2. **ts-node**: Traditional TypeScript runtime with full compiler API

#### **TypeScript Task Example**

```typescript
import { load, concurrent, serial, exec } from "@xarc/run";

interface BuildOptions {
  production?: boolean;
  watch?: boolean;
}

// Task context type based on actual implementation
interface TaskContext {
  run: (task: any) => void;
  argv: string[];
  cliCmd: any;
  argp: any;
  args: any;
  argOpts: any;
  err?: Error;
  failed?: Error[];
}

const buildTask = (options: BuildOptions = {}): string => {
  const mode = options.production ? "production" : "development";
  const watchFlag = options.watch ? "--watch" : "";
  return `webpack --mode ${mode} ${watchFlag}`;
};

load({
  build: buildTask(),
  "build:prod": buildTask({ production: true }),
  "build:watch": buildTask({ watch: true }),

  test: concurrent(exec("jest"), exec("eslint src/")),

  deploy: async (context: TaskContext) => {
    console.log("Deploying with options:", context.argOpts);
    return serial("build:prod", "upload", "verify");
  }
});
```

### 6. CLI Integration

xrun provides sophisticated command line integration with argument parsing, context management, and flexible task invocation.

#### **Command Parsing**

Built on `nix-clap` for advanced argument parsing with subcommand support:

```javascript
// Parsed command structure
{
  parsed: {
    command: {
      subCmdNodes: {
        task1: { argv: ["task1", "--opt1", "value1"] },
        task2: { argv: ["task2", "--opt2"] }
      },
      jsonMeta: { opts: {...}, source: {...} }
    },
    _: ["remaining", "args", "after", "--"]
  }
}
```

#### **Context Management**

The `CliContext` class encapsulates CLI parsing details and provides clean access to command information:

```javascript
// CLI Layer creates context
const cliContext = new CliContext(cmdArgs);
runner.setCliContext(cliContext);

// Available methods for accessing command data
class CliContext {
  getTaskCommand(taskName)    // Get full command object for task
  getTaskArgv(taskName)       // Get argv array for specific task
  getGlobalOptions()          // Get global CLI options
  getRemainingArgs()          // Get arguments after "--"
  isLastTask(taskName)        // Check if task is last from CLI
  hasRemainingArgs()          // Check if remaining args exist
}
```

This design provides clean separation between CLI parsing and task execution, following the principle of least privilege where each component only accesses the information it needs.

#### **Argument Passing**

Arguments after `--` are automatically passed to shell commands and available to JavaScript functions:

```bash
# Arguments passed to shell commands
xrun test -- --grep "specific test"
xrun build -- --watch --verbose

# Basic task execution
xrun build test deploy

# Serial execution
xrun --serial lint test build
```

For JavaScript tasks, arguments are available via the execution context:

```javascript
load({
  myTask(context) {
    console.log("Parsed options:", context.argOpts);
    // Access to all CLI context through context object
  }
});
```

## Core Implementation Details

### XQtor (Task Executor)

The `XQtor` class in `lib/xqtor.js` is the heart of the execution engine:

#### **Execution Stack**

- Tasks are managed on a stack (`xqItems` array)
- Stack-based execution with mark items for completion tracking
- Supports complex nested execution patterns

#### **Task Processing Pipeline**

1. **Value Resolution**: Determine task type and extract executable content
2. **Type Dispatch**: Route to appropriate executor method
3. **Execution**: Run task with proper environment and options
4. **Completion Tracking**: Mark completion and handle errors
5. **Next Task**: Pop next item from stack or complete

#### **Key Methods**

- `_shellXer()`: Execute shell commands with full feature support
  - Argument assembly from CLI context
  - Flag parsing and process selection
  - Environment variable management
- `_functionXer()`: Execute JavaScript functions with context
  - CLI context integration
  - Argument parsing and passing
  - Return value processing
- `_processArray()`: Handle array tasks with serial/concurrent logic
- `_processDep()`: Resolve and execute task dependencies

#### **CLI Context Integration**

```javascript
// In _shellXer method
const cliContext = this._xrun.getCliContext();
const itemArgv = qItem.argv;
const cliArgv = cliContext.getTaskArgv(qItem.name);
const remainingArgv = (cliContext.isLastTask(qItem.name) && cliContext.getRemainingArgs()) || [];

// Build complete command
const cmd2 = []
  .concat(itemArgv.slice(1), cliArgv.slice(1), remainingArgv)
  .map(x => (x && x.includes(" ") ? `"${x}"` : x))
  .join(" ");
```

### XQTree (Execution Tree)

Manages the hierarchical structure of task execution:

- Parent-child relationships for nested tasks
- Unique ID generation for tracking
- Tree traversal for status reporting
- Cleanup and resource management

### Error Handling Strategy

#### **Error Propagation**

- Errors bubble up through the execution tree
- `stopOnError` configuration controls failure behavior
- Signal handling for graceful process termination

#### **Process Management**

- Child process tracking and cleanup
- SIGTERM handling for graceful shutdown
- Resource cleanup on failure

#### **Recovery Mechanisms**

- Finally hooks always execute
- Optional task execution
- Failure isolation in concurrent tasks

## Usage Patterns

### Build System Integration

```javascript
const { load, concurrent, serial, exec } = require("@xarc/run");

load({
  // Development workflow
  dev: concurrent("watch-css", "watch-js", "serve"),

  // Production build
  build: serial("clean", concurrent("build-css", "build-js"), "optimize"),

  // CI/CD pipeline
  ci: serial("install", "lint", concurrent("test", "build"), "deploy")
});
```

### Microservice Management

```javascript
load({
  "start-all": concurrent("start-auth", "start-api", "start-web"),

  "test-integration": serial("start-all", "wait-for-services", "run-integration-tests", {
    finally: "stop-all"
  })
});
```

### Complex Development Workflows

```javascript
load({
  "full-test": {
    dep: ["build"],
    task: concurrent(serial("unit-tests", "integration-tests"), "lint", "security-scan"),
    finally: "cleanup-test-db"
  }
});
```

## Technical Specifications

### Dependencies

- **insync**: Async control flow management (concurrent/serial execution)
- **nix-clap**: Advanced CLI argument parsing with subcommand support
- **xsh**: Enhanced shell execution with cross-platform compatibility
- **unwrap-npm-cmd**: npm command processing and normalization
- **chalk/chalker**: Terminal output formatting and colors
- **optional-require**: Safe module loading for provider packages
- **read-pkg-up**: Package.json discovery and parsing

### Supported Environments

- **Node.js**: 12+ (based on dependency requirements)
- **Platforms**: Windows, macOS, Linux, WSL
- **Shells**: bash, zsh, cmd, PowerShell
- **TypeScript**: 4.0+ (with tsx or ts-node)

### Performance Characteristics

- **Memory**: Stack-based execution for constant memory usage
- **Concurrency**: Parallel execution scales with system resources
- **Startup**: Fast initialization with lazy loading
- **I/O**: Event-driven architecture minimizes blocking
- **Process Management**: Efficient child process handling

### Extension Points

#### **Task Type Extensions**

```javascript
// Custom task type handler
XQtor.prototype._customTypeXer = function(qItem, value) {
  // Custom execution logic
};
```

#### **Reporter Extensions**

```javascript
// Custom progress reporter
class CustomReporter {
  onExecute(data) {
    /* custom logging */
  }
  onComplete(data) {
    /* custom completion handling */
  }
}
```

#### **Provider Package Hooks**

```javascript
// Provider package with hooks
function loadTasks(xrun) {
  xrun.on("execute", data => {
    // Custom execution monitoring
  });

  xrun.load("custom", tasks);
}
```

### Memory Management

- **Stack Efficiency**: Task execution uses fixed-size stack
- **Event Cleanup**: Automatic event listener cleanup
- **Process Cleanup**: Child process tracking and termination
- **Context Isolation**: Execution contexts properly scoped

### Security Considerations

- **Command Injection**: Shell commands properly escaped
- **Process Isolation**: Child processes run in controlled environment
- **Path Traversal**: Working directory restrictions
- **Provider Security**: Optional package loading with error isolation

## Future Considerations

### Scalability

- Task execution could be distributed across processes
- Result caching for expensive operations
- Incremental execution based on file changes

### Developer Experience

- Enhanced debugging tools
- Visual task dependency graphs
- Performance profiling integration
- IDE integration support

### Enterprise Features

- Task result persistence
- Audit logging
- Security policy enforcement
- Remote task execution

## Conclusion

@xarc/run represents a sophisticated approach to task execution that bridges the gap between simple npm scripts and complex build systems. Its flexible architecture, comprehensive feature set, and robust error handling make it suitable for everything from simple development workflows to complex CI/CD pipelines.

The architecture demonstrates a commitment to clean design principles and extensibility. The CliContext system provides proper separation of concerns, while the provider package ecosystem enables code reuse across projects. First-class TypeScript support and automatic runtime detection make it well-suited for modern JavaScript development workflows.

Key strengths include:

- **Clean Architecture**: Separation of concerns between CLI, execution, and task systems
- **Extensibility**: Provider packages and plugin system for ecosystem growth
- **Type Safety**: Full TypeScript integration with type-safe task definitions
- **Error Handling**: Comprehensive error management with graceful degradation
- **Performance**: Stack-based execution with efficient resource management

The system's ability to compose simple task definitions into complex execution patterns while maintaining clear semantics and reliable error handling makes it an excellent choice for teams requiring more control over their build and deployment processes than traditional npm scripts provide.

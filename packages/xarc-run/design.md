# @xarc/run Design Document

## Project Overview

**@xarc/run** (also known as `xrun`) is a sophisticated JavaScript task runner that serves as an enhanced alternative to `npm run`. It's designed to manage and execute tasks both concurrently and serially, with extensive support for JavaScript-based task definitions.

### Core Purpose

- Enhanced replacement for `npm run` with concurrent/serial execution capabilities
- JavaScript-first task definition system
- Complex workflow orchestration for build systems and CI/CD pipelines
- Unified interface for shell commands, JavaScript functions, and npm scripts

## Architecture Overview

### Core Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CLI Layer     │    │   Core Library   │    │   Task System   │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │ bin/xrun.js │ │───>│ │ xrun-instance│ │───>│ │   XQtor     │ │
│ │ cli/xrun.js │ │    │ │ xrun.js      │ │    │ │ (Executor)  │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Support Libs   │    │   Task Types    │
                       │                  │    │                 │
                       │ ┌──────────────┐ │    │ ┌─────────────┐ │
                       │ │ XQTree       │ │    │ │ Functions   │ │
                       │ │ XQItem       │ │    │ │ Strings     │ │
                       │ │ XTaskSpec    │ │    │ │ Arrays      │ │
                       │ │ Reporters    │ │    │ │ Objects     │ │
                       │ └──────────────┘ │    │ └─────────────┘ │
                       └──────────────────┘    └─────────────────┘
```

### Key Architecture Patterns

1. **Task Executor Pattern**: Central XQtor manages a stack-based execution model
2. **Plugin Architecture**: Extensible reporters and task type handlers
3. **Tree Structure**: Tasks organized in execution trees with parent-child relationships
4. **Event-Driven**: Extensive event emission for monitoring and debugging
5. **Promise/Callback Hybrid**: Support for both async/await and callback patterns

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
    console.log("Args:", context.argv);
    return ["build", "test"]; // Can return more tasks
  };
}
```

Features:

- Async/await support
- Stream handling
- Context access (argv, environment, etc.)
- Return values become new tasks

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

### 4. CLI Integration

#### **Argument Processing**

- Built-in CLI parsing with `nix-clap`
- Per-task argument definitions
- Context access to parsed arguments
- Unknown option handling

#### **Command Examples**

```bash
# Basic usage
xrun build test deploy

# Serial execution
xrun --serial lint test build

# With arguments
xrun test --coverage --reporter spec
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
- `_functionXer()`: Execute JavaScript functions with context
- `_processArray()`: Handle array tasks with serial/concurrent logic
- `_processDep()`: Resolve and execute task dependencies

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

- **insync**: Async control flow management
- **nix-clap**: CLI argument parsing
- **xsh**: Enhanced shell execution
- **unwrap-npm-cmd**: npm command processing
- **chalk/chalker**: Terminal output formatting

### Supported Environments

- Node.js 12+ (based on dependencies)
- Windows, macOS, Linux
- WSL support (as evidenced by project structure)

### Performance Characteristics

- Stack-based execution for memory efficiency
- Event-driven architecture for responsiveness
- Minimal overhead for simple tasks
- Parallel execution scales with system resources

### Extension Points

- **Reporters**: Custom output formatting
- **Task Types**: New task definition patterns
- **Shell Handlers**: Custom command processors
- **Event Listeners**: Monitoring and debugging hooks

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

The system's strength lies in its ability to compose simple task definitions into complex execution patterns while maintaining clear semantics and reliable error handling. This makes it an excellent choice for teams requiring more control over their build and deployment processes than traditional npm scripts provide.

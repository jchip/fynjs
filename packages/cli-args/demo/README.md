# Demo Projects

This directory contains independent demo projects that test @fynjs/cli-args as a dependency. Each demo is a separate npm package with its own `package.json` and can be installed and run independently.

## Demo Projects

### sample-1-cjs

A CommonJS demo project that uses @fynjs/cli-args to implement a numbers calculator CLI.

**Features:**

- CommonJS module format
- Implements sum, sort, times, and divide commands
- Demonstrates command-line argument parsing and execution

**Setup:**

```bash
cd demo/sample-1-cjs
fyn install
```

**Run:**

```bash
npm test
# or manually:
node numbers.cjs divide -# 90 10 1 2 3 -. sum 1 2 3 4 5 6 7 8 9 10 -. times 5 6 7
```

### sample-1-esm

An ES Module demo project that provides the same functionality as sample-1-cjs but in ESM format.

**Features:**

- ES Module format (`"type": "module"`)
- TypeScript source files with tsx runner
- Compiled JavaScript output
- Same calculator functionality as CJS version

**Setup:**

```bash
cd demo/sample-1-esm
fyn install
```

**Run:**

```bash
npm run test      # runs TypeScript version with tsx
npm run test-js   # runs compiled JavaScript version
```

## Testing @fynjs/cli-args as a Dependency

These demo projects are designed to test @fynjs/cli-args in real-world scenarios:

1. **Independent packages**: Each demo has its own `package.json` and `node_modules`
2. **Dependency testing**: They use @fynjs/cli-args as a regular npm dependency (not a local workspace)
3. **Build verification**: Ensures @fynjs/cli-args works correctly when installed via npm
4. **Format compatibility**: Tests both CommonJS and ES Module consumption

## Installation

Use `fyn` (the project's package manager) to install dependencies:

```bash
fyn install
```

This ensures the local @fynjs/cli-args package is properly linked as a dependency for testing.

## Commands

Both demos implement the same CLI commands:

- `sum <numbers...>` - Add up all numbers
- `sort <numbers...>` - Sort numbers (with optional `--reverse` flag)
- `times <numbers...>` - Multiply all numbers
- `divide <dividend> <divisor>` - Divide two numbers (with optional `--switch` flag)

## Purpose

These demos serve as:

- Integration tests for @fynjs/cli-args functionality
- Examples of how to consume @fynjs/cli-args in different module formats
- Verification that the package works correctly when installed as a dependency
- Reference implementations for users

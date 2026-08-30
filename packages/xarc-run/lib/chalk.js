//
// chalk is ESM-only. This package is ESM too, so importing it is unremarkable - this module
// stays only because a dozen call sites already point at it, and it is the one place to change
// if the color library is ever swapped.
//
// Bound explicitly rather than `export { default } from "chalk"`: a bare re-export can reach
// consumers as a module namespace, and call sites assign to `chalk.level`.
//
import chalk from "chalk";

export default chalk;

# @fynjs/cli-args reference

`@fynjs/cli-args` parses command line arguments for Node.js CLIs. It supports options, aliases, sub-commands, typed arguments, defaults, generated help and version output, and `exec` handlers. It has no runtime dependencies. ESM only (`"type": "module"`).

## Imports

```js
import { NixClap } from "@fynjs/cli-args";
import { Command, InvalidArgSpecifierError, UnknownOptionError, UnknownCliArgError } from "@fynjs/cli-args";
```

```ts
import type {
  NixClapConfig, CommandSpec, OptionSpec, ParseResult, CommandNode,
  CommandMeta, CommandExecFunc, OptionValue, ArgumentValue, OptionSource
} from "@fynjs/cli-args";
```

Everything is a named export from the package root. There is no default export and there are no subpaths (only `@fynjs/cli-args/package.json`).

Runtime exports: `NixClap`, `Command` (the internal `CommandBase` class, renamed), `InvalidArgSpecifierError`, `UnknownOptionError`, `UnknownCliArgError`.

Type-only exports: `NixClapConfig`, `ParseResult`, `CommandSpec`, `OptionSpec`, `CommandExecFunc`, `CommandNode`, `CommandMeta`, `OptionValue`, `ArgumentValue`, `OptionSource`. `CommandNode` is exported as a type only: you receive instances in `exec` handlers and in `ParseResult`, you cannot construct one.

Not exported: `BaseSpec` (its fields are inherited by `OptionSpec` and `CommandSpec`, documented below), `CustomTypeFunc`, `GroupOptionSpec`, `OptionMatch`, `CommandExecAsyncFunc`, `OptionNode`, `ClapNode`, `Parser`, `Options`, `defaultOutput`, `defaultExit`.

## Quick use

```js
import { NixClap } from "@fynjs/cli-args";

const parsed = new NixClap({ name: "mycli", version: "1.0.0" })
  .init2({
    options: { verbose: { alias: "v2", desc: "be loud" } },
    subCommands: {
      build: {
        args: "<target string> [more..]",
        options: { out: { args: "<dir>", argDefault: "dist" } },
        exec: cmd => console.log(cmd.args, cmd.opts)
      }
    }
  })
  .parse();
```

Call order is `new NixClap(config)`, then `.version()`, `.help()`, `.usage()`, `.cmdUsage()` as needed, then `init`/`init2`, then `parse`/`parseAsync`. `version()` and `help()` must run before `init`/`init2`, which reads them. `parse`, `parse2`, `makeHelp` before init: `makeHelp` returns `["Error: CLI not initialized. Call init() or init2() first."]`; `parse`/`parse2` throw a `TypeError`.

## `NixClap`

```ts
class NixClap extends EventEmitter {
  constructor(config?: NixClapConfig);
  output: (s: string) => void;           // public field
  init(options?: Record<string, OptionSpec>, commands?: Record<string, CommandSpec>): this;
  init2(rootCommandSpec?: CommandSpec): this;
  version(v: number | string): this;
  help(custom: any): this;
  usage(msg: string): this;
  cmdUsage(msg: string): this;
  skipExec(skip?: boolean): void;        // default true
  removeDefaultHandlers(...events: string[]): this;
  parse(argv?: string[], start?: number): ParseResult;
  parseAsync(argv?: string[], start?: number): Promise<ParseResult>;
  parse2(argv: string[], start?: number): ParseResult;
  runExec(parsed: ParseResult): number;
  runExecAsync(parsed: ParseResult): Promise<number>;
  applyConfig(config: Record<string, any>, parsed: ParseResult, src?: "cli" | "user" | "default"): this;
  makeHelp(cmdPath?: string | string[]): string[];
  showHelp(err?: Error, cmdPath?: string | string[]): void;
  showError(err: Error): void;
  showVersion(): void;
}
```

### `NixClapConfig`

All fields optional. The constructor copies the object shallowly.

| option | type | default | behavior |
| --- | --- | --- | --- |
| `name` | `string` | derived | Program name used in help and error text. When unset, `parse`/`parse2` with `start > 0` set it to `path.basename(argv[start - 1], ".js")`. Otherwise help shows `program` in some places and an empty string in others. |
| `version` | `number \| string` | none | If truthy at `init`/`init2` time, a `--version` option is added to the root command. `showVersion` prints `${version}\n`. |
| `versionAlias` | `string` | `["V", "v"]` | Aliases for `--version`. When set it is used as is (typed `string`, though an array also works at runtime). When unset, `V` and `v` are used minus any that a root option already uses in its `alias`. |
| `help` | `OptionSpec \| false` | built-in | If the key is present in the config (even `undefined`) it replaces the built-in help option. `false` disables help entirely. A custom spec is not the built-in help, so the `help` event is not emitted for it (see `parse`). |
| `helpAlias` | `string \| string[]` | `["?", "h"]` | Aliases of the built-in `--help` option. Ignored when `help` is set. |
| `defaultCommand` | `string` | none | Name (or alias) of a top-level command to run when the argv has only options (see Default command). |
| `allowUnknownCommand` | `boolean` | `false` | Unknown non-option words become sub-commands named after the word instead of errors. Root level only, or where a command requires a sub-command. |
| `unknownCommandFallback` | `string` | none | Name of a root sub-command that takes an unknown first word as its first argument. Ignored when `allowUnknownCommand` is true or the named command does not exist. |
| `allowUnknownOption` | `boolean` | `false` | Default for the root command (`spec.allowUnknownOption ?? config.allowUnknownOption`). Also selects which internal unknown-command helper is used for `allowUnknownCommand`. It is not copied to sub-commands. |
| `usage` | `string` | `"$0"` | Root usage text. `$0` is replaced by the program name. |
| `cmdUsage` | `string` | `"$0 $1"` | Usage text for sub-command help. `$1` is replaced by the command name used. |
| `skipExec` | `boolean` | `false` | `parse`/`parseAsync` do not call `runExec`/`runExecAsync`. |
| `skipExecDefault` | `boolean` | `false` | The parser does not insert `defaultCommand` upfront. No other code inserts it later. |
| `output` | `(text: string) => void` | `process.stdout.write` | Receives all help, version and error text. |
| `exit` | `(code: number) => void` | emit `"exit"` event | Called after help, version and error output. When set, the `"exit"` event is never emitted. |
| `handlers` | `Record<string, ((parsed?: ParseResult) => void \| Promise<void>) \| false>` | none | Replaces the default handler of an event by name. `false` removes it. Only the names `pre-help`, `help`, `post-help`, `version`, `parse-fail`, `no-action` take effect. Ignored when `noDefaultHandlers` is true. |
| `noDefaultHandlers` | `boolean` | `false` | Installs no default handlers and no default `"exit"` listener. `handlers` is ignored. `parse` returns the result (errors in `errorNodes`) and prints nothing. |
| `helpZebra` | `boolean` | `true` | Alternating dim rows in help. `false` turns it off. The setting is module global, so the last constructed `NixClap` wins. |
| `allowDuplicateOption` | `boolean` | `false` | When false, a sub-command declaring an option with the same name as an ancestor's option throws at `init`. When true it is allowed. The `help` option is always exempt. |

### Constructor behavior

- The default exit behavior emits `"exit"` with the code. The default listener sets `process.exitCode = code`. It never calls `process.exit`, so `parse` always returns normally.
- Default handlers are registered with `this.on(...)` for `pre-help`, `help`, `post-help`, `version`, `parse-fail`, `no-action`, and an `"exit"` listener.

### `init2(rootCommandSpec?)` and `init(options?, commands?)`

`init2` builds the command tree from a root `CommandSpec` and returns `this`. `init(options, commands)` is `init2({ options: options || {}, subCommands: commands || {} })`.

Rules applied by `init2`:

- Root `alias` is forced to the internal name `~root-command~`. Root `desc` defaults to `""`. Used root spec fields: `desc`, `args`, `argDefault`, `exec`, `usage`, `customTypes`, `options`, `subCommands`, `allowUnknownOption`. Root `alias` and `required` are ignored.
- If a version is set, `options.version` is added with `desc: "Show version number"`.
- If help is not `false`, `options.help` is set (this overwrites a user option named `help` on the root) and a `help` option is added to every sub-command at every depth unless the command already has an option named `help`. In sub-commands, help aliases that collide with an alias of an option in the same command are dropped. At the root there is no filtering, so a root option using alias `h` or `?` throws the duplicate alias error.
- Throws `Error` for a duplicate alias within a command's options (`Init command <name> failed - Option alias <a> already used by option <o>`), a duplicate sub-command alias (`Command <name> alias <a> already used by command <c>`), and a sub-command option name that exists on an ancestor (`Command <c> option <o> already used by parent command '<p>'`, skipped with `allowDuplicateOption`). Argument specifier errors are described under Argument specifiers.
- Specs are copied (one level of plain-object copy), so mutating the original after `init` has no effect.

### `parse(argv?, start?)`

Parses, handles help, version and errors, then runs `exec` handlers. Returns `ParseResult`.

Steps:

1. `parse2(argv, start)`.
2. If `_checkFailures` is true, return the result. Order of checks:
   1. If the built-in help is active and some command node has `help` with source `"cli"`: set `parsed.helpNode`, emit `help` with `parsed`, stop. This wins over missing required options and other errors.
   2. If a version is set and the root has `version` from the command line: emit `version`, stop.
   3. If `errorNodes.length > 0`: emit `parse-fail` with `parsed`, stop.
3. If not `skipExec`: `runExec(parsed)`.

Default handlers:

| event | default behavior |
| --- | --- |
| `pre-help`, `post-help` | no-op. Emitted around help output with `{ self }`. |
| `help` | `showHelp(undefined, path)`. `path` is the `--help <cmd...>` words if given, otherwise the chain of commands from `helpNode` (nothing for root). Exit code 0. |
| `version` | `showVersion()`: prints `<version>\n`, exit code 0. |
| `parse-fail` | `showError(firstErrorNode.error)`: prints `Error: <message>\n` and `<name or "program"> --help for more info\n`, exit code 1. |
| `no-action` | `showHelp(new Error("No command given"))`: help, then `\nError: No command given\n`, exit code 1. |
| `"exit"` | sets `process.exitCode`. |

`no-action` is emitted by `runExec` when no `exec` ran and the tree has at least one `exec` handler anywhere (`getExecCount() > 0`).

A custom `help` option (`config.help` or `.help(spec)`) is never given the `help` event. Check its option value yourself after parse, or use `noDefaultHandlers`.

### `parseAsync(argv?, start?)`

Same as `parse`, but awaits `runExecAsync`. Use it when any `exec` is async.

### `parse2(argv, start = 0)`

Parses only. No help, version, error handling or `exec`.

```ts
// returns
{ command: CommandNode; argv: string[]; errorNodes: ClapNode[]; _: string[]; index: number }
```

- `argv === undefined` means `process.argv` with `start = 2`.
- When the name is unset and `start > 0`, name becomes `Path.basename(argv[start - 1], ".js")`.
- Parse errors (unknown option or argument, missing args, custom type failures) are stored on nodes and surface through `errorNodes`. `parse2` does not throw for them.
- After parsing: missing required options add the error `missing these required options a, b` to the root node (checked before defaults, so a default does not satisfy `required`). Then defaults are applied (`source: "default"`) and camelCase option keys are added.
- `_` is `argv.slice(index)`: the entries after a bare `--`. `index` is where parsing stopped (one past the `--`, or `argv.length`).

### `runExec(parsed)` and `runExecAsync(parsed)`

Run `exec` handlers and return the number of handlers run.

Order:

1. Every command node in the parsed tree that has `exec`, depth first, parent before children, in the order the nodes were created. The root is never in this list. Each handler is called as `exec(node, parsed)`. `parsed.execCmd` is set to the first node run.
2. The root `exec` runs if nothing ran in step 1, no sub-command node exists, the root has `exec`, and either root args were given (`argsList.length > 0`) or the root has no `args` spec. Then `parsed.execCmd` is the root and the count is 1.
3. If the count is 0 and any `exec` exists in the spec tree, the `no-action` event is emitted.

`runExec` cannot await. If a handler returns a thenable, it keeps running detached, and after the run `runExec` prints `Warning: async exec handler ... invoked synchronously ...` through `output`. Use `parseAsync` (or `skipExec` and `runExecAsync`). `runExecAsync` awaits each handler in sequence and does not warn. Calling `runExec` or `runExecAsync` after `parse` already ran handlers runs them again.

Handlers must not mutate the parsed tree.

### `applyConfig(config, parsed, src = "user")`

Merges outside values (for example a config file) into a parsed result. For each key in `config`:

- If the key matches a known option (by name or alias) of the root command and that option is absent or its source does not start with `"cli"`, it is replaced by the config value with source `src`. A command line value always wins.
- If the key is not a known option and not already present, it is added as an unknown option with source `src`.
- Only root command options are matched. Values may be non-strings; they are placed through the normal argument conversion (`[].concat(value)` per argument).
- The cached `jsonMeta` is cleared for the root so `opts`, `source` reflect the change.

Returns `this`. It does not re-run the required check, so config cannot satisfy a `required` option.

### `removeDefaultHandlers(...events)`

Removes the listeners this instance installed for the named events. `"*"` as the first argument removes every default handler in the handler table, but not the `"exit"` listener. A handler you passed through `config.handlers` is not removed. Returns `this`.

### `version(v)`, `help(custom)`, `usage(msg)`, `cmdUsage(msg)`, `skipExec(skip = true)`

- `version(v)` sets the version. Call before `init`. Returns `this`.
- `help(custom)` sets the help option spec. Pass `false` to disable. Option name is always `help`. Call before `init`. Returns `this`.
- `usage(msg)` and `cmdUsage(msg)` set the usage texts. Return `this`.
- `skipExec(skip = true)` sets both `skipExec` and `skipExecDefault`. Returns nothing (not chainable).

### `makeHelp(cmdPath?)`, `showHelp(err?, cmdPath?)`, `showError(err)`, `showVersion()`

- `makeHelp(cmdPath)` returns help lines. `cmdPath` is a command name or an array of names (sub-command path, aliases allowed). An unknown name returns `["Unknown command: <name>"]`. Layout: a blank line, `Usage: ...`, the description (indented), an alias note when called by alias, `Commands:` (one line per sub-command: `<name> <args> <desc> [aliases: a b]`) and `Options:` (see Help text).
- `showHelp(err, cmdPath)`: emits `pre-help`, writes the help lines plus `\n`, and if `err` is given writes `\nError: <message>\n` and uses exit code 1. Then writes `\n`, emits `post-help`, and calls exit with the code (0 without `err`).
- `showError(err)` and `showVersion()` are as in the default handlers above.

Usage line rules in `makeHelp`: the command's own `usage` wins, then `usage()` for root help, then `cmdUsage()` for sub-commands. When the root has `args` and sub-commands, two usage lines are printed (the usage line and `<name> <command> [command-args] [options]`). With the default usage and only sub-commands the line is `Usage: <name> <command>`. With the default usage and only root `args`, it is `Usage: <name> <args>`.

### Help text

Options lines are `--name, -a, --alias  <desc> [<type>] [default: <JSON>]`, padded so descriptions align and wrapped to the terminal width (`process.stdout.columns`, 80 if unknown). `<type>` is the first argument type, followed by ` ..` when the option takes more than one value. `[default: ...]` shows only for single-argument options with a truthy `argDefault`. Commands without options show `Command <name> has no options` only if the option list is empty. Rows alternate dim styling unless `helpZebra` is false.

### Events

`NixClap` extends `EventEmitter`. All events are emitted synchronously.

| event | arguments | when |
| --- | --- | --- |
| `pre-help` | `{ self }` | start of `showHelp` |
| `help` | `ParseResult` | built-in `--help` given |
| `post-help` | `{ self }` | end of `showHelp`, before exit |
| `version` | none | `--version` given |
| `parse-fail` | `ParseResult` | parse errors present |
| `no-action` | none | no `exec` ran but exec handlers exist |
| `exit` | `code: number` | after help, version or error output (only without a custom `exit`) |

## Argument parsing rules

### Option forms

An argv entry starting with `-` is an option token. Anything else is a command name or an argument.

| token | meaning |
| --- | --- |
| `--name` | option `name` (or an alias with 2 or more characters) |
| `-x` | option or alias `x` |
| `--name=value` | inline value. The `=` must be at index 1 or later of the name. Consumes no more argv entries. |
| `-abc` | cluster: `a` and `b` are set as options with no values, `c` is the last option and may take values. A leading option that expects arguments gets none from the cluster and then fails with `Not enough arguments for option` if it has required args. |
| `--no-name` | sets `name` to `"false"` (so a boolean option becomes `false`). The name is the text after `no-`. A spec option literally named `no-x` cannot be set with this form. |
| `-.` or `--.` | ends the current option's argument gathering. Used when the option is variadic. Also ends greedy mode and ends the current command's argument gathering so a following word can be a sub-command. |
| `-#`, `-`, `---` | greedy mode for the current command: following non-option words are taken as its arguments, even if they match sub-command names. Option tokens are still parsed as options. Leave with `-.`. |
| `--` | stops parsing. Remaining entries are returned in `parsed._` and are not parsed. |

Short and long forms are not distinguished by dash count in matching: `-verbose` is a cluster of single characters, and `--v` matches an option or alias named `v`. Any alias or name works with one or two dashes when it is one character; names longer than one character need `--`.

A negative number such as `-5` is an option token. Give it as `--n=-5`.

### Aliases and names

- `alias` is a string or an array of strings. Each alias is unique within one command's options.
- Matching is exact and case sensitive. Own-property lookup, so names like `constructor` are safe.
- Names with `-` get a camelCase key (`dry-run` and `dryRun`) in `opts` and `source`. Aliases used on the command line also get keys (see Result shape).

### Option values

Value consumption for `--name value ...`:

- An option with no `args`: takes no values. Result `true`, or `false` for `--no-name`. With `--name=value` the inline value is converted by shape: boolean words (`true false yes no on off`, case insensitive) become booleans, numeric strings become numbers, anything else stays a string. Note that `--flag=0` gives the number `0` and `--flag=1` gives `1`.
- An option with `args`: takes following non-option words up to the number of arguments it expects (the sum of the maxima), stopping early at the next option token. A missing required argument adds the error `Not enough arguments for option '<name>'`.
- If the first argument is typed `boolean` and the next word is not a boolean word (`true false yes no on off`), no word is consumed and the value is `true`. `0` and `1` are not boolean words. `--b yes` gives `true`, `--b no` gives `false`.
- A variadic option consumes every following non-option word, including words that match command names.

### Argument specifiers (`args`)

`args` is a string of `<...>` (required) and `[...]` (optional) groups. All required groups must come before optional ones. Each group is `name type..range`, all parts optional:

| group | meaning |
| --- | --- |
| `<name>` | required, type `string` |
| `<name number>` | required, named, typed |
| `<number>` | name omitted only if written with a leading space: `< number>`. A lone word is the name, so `<string>` throws (a name cannot be a type name). |
| `<..>` | variadic, 0 or more |
| `<name..>` | variadic, 0 or more |
| `<..3>` | exactly 3 (array) |
| `<..1,>` or `<..1,Inf>` | 1 or more |
| `<..1,3>` | 1 to 3 |

- Types: `string` (default), `number`, `int`, `integer`, `float`, `boolean`, plus keys of `customTypes`.
- `number` and `float` use `parseFloat`. `int` and `integer` use `parseInt(v, 10)`. Failed numeric parses give `NaN`, with no error.
- `boolean` uses the rules in Boolean conversion below.
- A required group's minimum counts toward the required total. An optional group contributes nothing to the required total.
- Only the last group may be variadic. A variadic group, or any `..` group, yields an array value.
- The type of an unnamed (no name) group is still used. Values are stored by index and by name when named.
- A command or option with `args` set to a string that has no groups throws `InvalidArgSpecifierError`.

Errors thrown at `init` time:

- `InvalidArgSpecifierError` (has `arg: string`): `Invalid args specifier '<x>' for '<name>'.`, `... Unknown type '<t>' for argument '<group>'.` (message prefixed with `option <name>` or `command <name>`), `Required arg '<x>' cannot follow optional arg '<y>'.`, `For args of <name> - Its name is using a type name: <t>.`
- Plain `AssertionError` (from `node:assert`, not `InvalidArgSpecifierError`): `For args specifier of '<name>', only the last one can be variadic`. A malformed range such as `..x` throws a plain `Error` (`Invalid number input 'x' - expected an integer`).

### Boolean conversion

For type `boolean` (and for no-`args` inline values that look like booleans):

- A numeric string is `false` if it equals 0, otherwise `true`.
- `false`, `no`, `off` (case insensitive) are `false`. Any other non-empty string is `true`. An empty string is `false`.
- Auto-boolean detection (`isBoolean`) recognizes only `true false yes no on off`, which is what decides whether `--b word` consumes `word`.

### Custom types

`customTypes: Record<string, fn | RegExp | string>` on an option or command. Every `type` used in `args` that is not a built-in type must be a key.

| handler | result |
| --- | --- |
| function `(value: string) => any` | its return value. If it throws, an error is added to the node with the thrown message, and the value becomes `"<type> custom type function threw error: <message>"`. |
| `RegExp` | `value.match(re)[0]` if it matches. If not and the spec has a truthy `argDefault`, that default is used. Otherwise the error `argument '<v>' didn't match RegExp requirement for <name>` is added and the raw string stays as the value. |
| string | the string, regardless of input. |

A legacy spec key `coercions` is read as a fallback when `customTypes` is absent. It is not in the TypeScript types. Values passed in already non-string (from `applyConfig`) skip conversion.

### Counting options

`counting: number` marks an option as counting. Each time it appears on the command line, its count goes up by one. `opts[name]` is the count and `optsCount[name]` holds the same count. The number given is not enforced by the code: `counting: 3` still counts a fourth occurrence. A counting option with `args` and exactly one argument yields that argument value in `opts` (single-arg takes priority over counting).

Repeating a non-counting option replaces the earlier value.

### Sub-commands

- A non-option word is matched against the current command's sub-commands (name, then alias). A match creates a command node and further words go to it.
- A command first takes arguments for itself while it has gathered fewer than `expectArgs`. A word that matches one of its sub-commands is always treated as a command first.
- Once a command has gathered all its expected arguments, further words go to its parent chain: a sibling sub-command or a parent argument. If nothing takes it: `Encountered unknown CLI argument '<w>' while parsing for command '<cmd>'.`
- A command that has sub-commands, no `exec`, no `args` and no matched sub-command yet requires one: an unknown word gives `Command '<name>' requires a subcommand. Unknown: '<w>'.`
- Multiple sub-commands can follow each other: `prog a b` runs `a` and `b` when both are root sub-commands. A sub-command of a sub-command is nested under its parent.
- Command arguments are gathered when the command ends (a new sub-command, `-.`, a full set, or end of argv). Missing required ones add `Not enough arguments for command '<name>'.`
- Unknown options are checked against the current command, then its ancestors (see Unknown handling).

### Default command

With `defaultCommand: "name"`:

- It triggers only when argv contains no non-option word at all (no word, no `--`), after skipping the values consumed by known root or default-command options, and no help or version token (`--help -h -? --version -v -V`) is present.
- Then the default command node is created up front, its option defaults are applied, and parsing continues under it. Root options still match.
- If the name does not match a command, the root gets the error `default command <name> not found`.
- Not triggered when the first word is an unknown command. That gives the normal unknown-command error (or `unknownCommandFallback`).
- With `skipExecDefault` (or `skipExec()`), the default command is not inserted, so it does not run.

### Unknown handling

- Unknown option: the option is looked up on the current command. If it has `allowUnknownOption` undefined, the lookup continues in the parent commands up to the root. If the command has `allowUnknownOption: false`, it errors there. At the root the effective value is `spec.allowUnknownOption ?? config.allowUnknownOption`. On error the message is `Encountered unknown CLI option '<name>'.` (an `UnknownOptionError` with `data`), and the option is still recorded in `opts`. With the flag true, the option is recorded with no error. Unknown options take no following words. `--x=1` records `1`.
- Unknown command word: see `UnknownCliArgError` and the messages above. With `allowUnknownCommand`, the word becomes a node under the root (or under the command that requires a sub-command), and `parsed.command.subCommands[word]` exists. Unknown-command nodes expect no arguments, so the next unknown word becomes a sibling.
- `unknownCommandFallback: "run"`: at the root, if no command matched yet and no root argument was taken, the first unknown word becomes the first argument of `run`, and later words continue to be gathered by `run`.

### Required options

`required: true` on an option. After parsing, if the option is absent from the root command node or a matched sub-command node, the root gets `missing these required options a, b`. An option satisfied only by `argDefault` is still reported missing. `required` is only checked for options. On commands it is accepted by the type but not used.

### Defaults

`argDefault` on an option: if the option is not in the command line (and was not added by `applyConfig`), after parsing it is added with `source: "default"`, using `[].concat(argDefault)` as its arguments. Applies to the root and to command nodes that exist in the result. Sub-commands not named on the command line get no defaults. A default is added even when the key exists with value `undefined` or `null` (`null` becomes `[null]`). For commands, `argDefault` has no effect except as the RegExp custom-type fallback above.

## Spec types

### `OptionSpec`

```ts
interface OptionSpec extends BaseSpec { counting?: number }
```

Also inherits the `BaseSpec` fields in the shared table below.

### `CommandSpec`

```ts
type CommandSpec = BaseSpec & {
  exec?: CommandExecFunc | ((cmd: CommandNode, parsed?: ParseResult) => Promise<void>);
  usage?: string | (() => string);
  options?: Record<string, OptionSpec>;
  subCommands?: Record<string, CommandSpec>;
  allowUnknownOption?: boolean;
};

type CommandExecFunc = (cmd: CommandNode, parsed?: ParseResult) => void;
```

### Fields shared by both (`BaseSpec`)

| field | type | default | behavior |
| --- | --- | --- | --- |
| `name` | `string` | the key | Declared but unused. The record key is the name. |
| `alias` | `string \| string[]` | none | Other names. Unique per parent (commands) or per command (options). |
| `desc` | `string \| () => string` | none | Help description. A function is called each time help is built. |
| `required` | `boolean` | none | Options only. See Required options. |
| `args` | `string` | none | Argument specifier string. |
| `argDefault` | `string \| string[] \| null` | none | Default arguments. See Defaults. |
| `customTypes` | `Record<string, ((value: string) => any) \| RegExp \| string>` | none | Custom argument types. |

Extra fields on `CommandSpec`:

| field | type | default | behavior |
| --- | --- | --- | --- |
| `exec` | function | none | Called after parse for each matched command. May be async only under `parseAsync`/`runExecAsync`. |
| `usage` | `string \| () => string` | none | Usage text for this command's help. `$0` is replaced by the program name and `$1` by the command name. |
| `options` | `Record<string, OptionSpec>` | `{}` | Options for this command. |
| `subCommands` | `Record<string, CommandSpec>` | none | Nested commands. |
| `allowUnknownOption` | `boolean` | undefined | `true` accepts unknown options. `false` errors on them at this command. Undefined defers to the parent. |

Extra field on `OptionSpec`: `counting?: number` (see Counting options).

### `Command` (class export)

```ts
class Command {
  constructor(name: string, cmdSpec: CommandSpec, ncConfig?: NixClapConfig, parent?: Command);
  name: string;
  args: ArgInfo[];            // parsed argument specifier
  needArgs: number;           // required argument count
  expectArgs: number;         // maximum argument count
  variadic?: { min: number; max: number };
  options: Options;           // option table
  subCmdCount: number;
  subCmdsBase: Record<string, Command>;
  subAliases: Record<string, string>;
  execCount: number;
  parent?: Command;
  readonly desc: string; readonly usage: string; readonly exec: Function | undefined;
  readonly alias: string[]; readonly cmdSpec: CommandSpec;
  readonly allowUnknownOption: boolean | undefined; readonly verbatimArgs: string;
  matchSubCommand(alias: string): { name: string; alias: string; cmd: Command | undefined };
  getExecCount(): number;
  makeHelp(progName?: string): string[];   // sub-command listing lines
  setCommandAliases(alias: string[], name: string): void;
  verifyOptionNotExist(optName: string, from: Command): void;
  verifyNoDupOptions(): void;
}
```

This is the processed form of a `CommandSpec`. Applications normally create commands only through `NixClap`. The constructor builds sub-commands and the option table recursively, and throws the init-time errors listed under `init2`. `ArgInfo` and `Options` are not exported by name.

## Parse results

### `ParseResult`

```ts
type ParseResult = {
  command: CommandNode;       // root command node
  errorNodes?: ClapNode[];    // nodes with errors (always set by parse/parse2)
  execCmd?: CommandNode;      // first node whose exec ran
  helpNode?: CommandNode;     // node that got --help, set by parse before the help event
  _: string[];                // argv entries after `--`
  argv: string[];             // the argv that was parsed
  index: number;              // parse stop index
};
```

`ClapNode` is not exported by name. Each error node has `error` (the first error), `errors`, `hasErrors`, `name`, `alias`, and `argv`.

### `CommandNode`

```ts
class CommandNode {
  name: string; alias: string;      // alias is the word used on the command line
  argsList: string[];               // raw argument words
  argsMap: Record<string, ArgumentValue>;
  argv: string[];                   // verbatim argv consumed (starts with the command name)
  subCmdNodes: Record<string, CommandNode>;
  optNodes: Record<string, OptionNode>;
  optCount: Record<string, number>;
  cmdBase: Command;
  isGreedy: boolean;
  readonly opts: Record<string, OptionValue>;
  readonly args: Record<string, ArgumentValue>;
  readonly source: Record<string, OptionSource>;
  readonly optsFull: Record<string, Record<string, ArgumentValue>>;
  readonly options: Record<string, Record<string, ArgumentValue>>;  // same as optsFull
  readonly subCommands: Record<string, CommandMeta>;
  readonly jsonMeta: CommandMeta;
  readonly rootCmd: CommandNode;
  readonly cmdChain: CommandNode[];  // root to this node, inclusive
  readonly hasErrors: boolean; readonly error: Error; readonly errors: Error[];
  readonly parent: ClapNode;
  getParent<T>(): T;
  getErrorNodes(errorNodes?: ClapNode[]): ClapNode[];
  getExecCommands(cmds: CommandNode[], includeSubCommands: boolean): CommandNode[];
  invokeExec(includeSubCommands: boolean, parsed?: ParseResult): number;
  invokeExecAsync(includeSubCommands: boolean, parsed?: ParseResult): Promise<number>;
  applyConfig(config: Record<string, any>, src?: OptionSource): void;
  applyDefaults(): void;
  makeCamelCaseOptions(): void;
  checkRequiredOptions(missing?: string[]): string[];
}
```

`opts`, `args`, `source`, `optsFull`, `options` and `subCommands` read from `jsonMeta`, which is built lazily and cached. After you mutate nodes yourself, the cache is stale. `NixClap.applyConfig` clears it for you.

### `CommandMeta` (`node.jsonMeta`)

| field | type | content |
| --- | --- | --- |
| `name` | `string` | command name (the root's name is the program name) |
| `alias` | `string` | word used on the command line (`~root-command~` for root) |
| `opts` | `Record<string, OptionValue>` | option values by name (see below) |
| `optsCount` | `Record<string, number>` | occurrence counts. Counts every option, not only counting ones. |
| `optsFull` | `Record<string, Record<string, ArgumentValue>>` | each option's full argument map: keyed by argument name (when named) and index |
| `args` | `Record<string, ArgumentValue>` | command arguments by argument name and index |
| `argList` | `string[]` | raw argument words, including ones beyond the spec |
| `source` | `Record<string, OptionSource>` | where each option came from |
| `verbatim` | `Record<string, string \| string[]>` | always `{}` in this version |
| `subCommands` | `Record<string, CommandMeta>` | matched sub-commands by name |
| `ccLong`, `unknown` | optional | declared, never set |

`opts[name]` value shape:

- Option with exactly one argument in its spec: the converted value (`opts.n`), or an array for `..` arguments.
- Counting option without args: the count.
- No-`args` option: `true`, or `false` for `--no-x`, or the inline value as converted by shape.
- Otherwise (two or more arguments): the argument map (keys are indexes and names, such as `{ "0": "1", "1": 2, a: "1", b: 2 }`).

Keys: the long name, its camelCase form if different, and the alias used on the command line if different from the name. `source` and `optsFull` use the same keys. An option given by an alias that was not used on the command line has no alias key.

`OptionSource` values: `"cli"`, `"default"`, `"user"` are assigned. `"cli-default"` and `"cli-unmatch"` are in the type but never assigned by this code. Unknown options from the command line have `"cli"`.

`OptionValue` and `ArgumentValue` are both `unknown`. Narrow before use.

## Error classes

```ts
class InvalidArgSpecifierError extends Error { arg: string; constructor(msg: string, arg?: string) }
class UnknownOptionError extends Error { data: OptionMatch; constructor(msg: string, data: OptionMatch) }
class UnknownCliArgError extends Error { arg: string; constructor(msg: string, arg: string) }
```

- `InvalidArgSpecifierError`: thrown synchronously from `init`/`init2` (or `new Command`) for a bad `args` string. `arg` is the offending specifier string for the unknown type case and `""` for other cases.
- `UnknownOptionError`: created during parsing and stored on the command node (`errorNodes[i].error`). Not thrown to the caller. `data` has `name`, `alias?`, `value`, `verbatim`, `arg` (the raw token) and `dashes`.
- `UnknownCliArgError`: created during parsing for an argument or command nobody can take, and stored on the node. `arg` is the word. Not thrown to the caller.

All other parse errors (`Not enough arguments ...`, `missing these required options ...`, RegExp mismatch, custom function errors, `default command ... not found`) are plain `Error` objects stored on nodes.

## Defaults and environment

- Output goes to `process.stdout` unless `output` is set. Terminal width comes from `process.stdout.columns`, 80 if unset.
- The package reads no environment variables and no config files. `applyConfig` is the hook for config values.
- `process.argv` is used only when `parse`/`parseAsync`/`parse2` get `argv === undefined`.

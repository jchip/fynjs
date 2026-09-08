/**
 * A config file that exists but can't be parsed is a user mistake, not a bug. FJM-189 made
 * these surface instead of being swallowed - which was right, since a swallowed parse error
 * got reported as "no config found" and let callers overwrite the broken file - but it left
 * every CLI dumping a raw stack for a stray trailing comma.
 *
 * The CLIs turn this into a plain warning and a clean exit, so the failure has to be
 * distinguishable from every other way loading config can go wrong.
 */
export class FynpoConfigError extends Error {
  /**
   * Stable marker for {@link isFynpoConfigError}. `instanceof` is not reliable here: fyn and
   * fynpo each bundle their own copy of this module, so an error crossing between them is not
   * an instance of the local class.
   */
  readonly code = "FYNPO_BAD_CONFIG";

  /** the config file that failed to parse */
  readonly filePath: string;

  /** the underlying failure, without the `Failed to ...` framing */
  readonly reason: string;

  /**
   * Set when the config file is code that ran and threw - a `fynpo.config.js`. The user still
   * needs the stack to find the throw inside their own config, so the banner keeps it. A JSON
   * file has no code to blame and leaves this undefined, so its banner stays stack-free.
   */
  readonly cause?: Error;

  constructor(filePath: string, reason: string, cause?: Error) {
    super(
      cause
        ? `Failed to load ${filePath} - ${reason}`
        : `Failed to read JSON file ${filePath} - ${reason}`
    );
    this.name = "FynpoConfigError";
    this.filePath = filePath;
    this.reason = reason;
    this.cause = cause;
  }
}

export function isFynpoConfigError(err: unknown): err is FynpoConfigError {
  return Boolean(err) && (err as { code?: string }).code === "FYNPO_BAD_CONFIG";
}

/**
 * Render a bad config file as a banner a user can act on. `cmdName` names the CLI that's
 * stopping, since both fyn and fynpo search the same files.
 */
export function formatFynpoConfigError(err: FynpoConfigError, cmdName: string): string {
  const bar = "=".repeat(72);

  const head = [
    "",
    bar,
    err.cause ? "  CONFIG FILE FAILED TO LOAD" : "  INVALID CONFIG FILE",
    "",
    `    file: ${err.filePath}`,
    `   error: ${err.reason}`,
    "",
  ];

  const body = err.cause
    ? [
        `  ${cmdName} found this file while searching for a monorepo root, but running`,
        "  it threw. The stack below points into the config itself.",
        "",
        ...(err.cause.stack || String(err.cause)).split("\n").map(line => `  ${line}`),
      ]
    : [
        `  ${cmdName} found this file while searching for a monorepo root, but it is`,
        "  not valid JSON, so it cannot be used.",
        "",
        "  Fix the JSON, or remove the file if this directory is not meant to be a",
        "  fynpo monorepo.",
      ];

  return [...head, ...body, bar, ""].join("\n");
}

/**
 * Coerced option values, including argument maps and arbitrary custom converter results.
 * Narrow the value before using type-specific operations.
 */
export type OptionValue = unknown;

/**
 * Coerced argument values. Custom converters may return any value.
 */
export type ArgumentValue = unknown;

/**
 * Source tracking for where option/argument values came from
 */
export type OptionSource = "cli" | "cli-default" | "cli-unmatch" | "default" | "user";

/**
 * Represents JSON metadata for a command.
 */
export type CommandMeta = {
  /**
   * Options associated with the command.
   * Keys are option names, values are the parsed option values.
   */
  opts: Record<string, OptionValue>;

  /**
   * Count of each option used (for counting options).
   */
  optsCount: Record<string, number>;

  /**
   * Full options associated with the command (including array indices).
   * Each entry is the option's full args map, keyed by arg name (or index for
   * unnamed args), which is why the value is a record and not a bare value.
   */
  optsFull: Record<string, Record<string, ArgumentValue>>;

  /**
   * Name of the command.
   */
  name?: string;

  /**
   * Alias for the command.
   */
  alias?: string;

  /**
   * CamelCase version of the long option.
   */
  ccLong?: string;

  /**
   * Indicates if the command is unknown.
   */
  unknown?: boolean;

  /**
   * Formally specified and recognized arguments passed to the command.
   * Keys are argument names from the args spec, values are parsed values.
   */
  args: Record<string, ArgumentValue>;

  /**
   * List of all arguments passed to the command, even unknown ones.
   */
  argList: string[];

  /**
   * Source tracking for options - indicates where each option value came from.
   */
  source: Record<string, OptionSource>;

  /**
   * Verbatim (original string) values for options before type coercion.
   */
  verbatim: Record<string, string | string[]>;

  /**
   * Sub-commands associated with this command.
   */
  subCommands: Record<string, CommandMeta>;
};

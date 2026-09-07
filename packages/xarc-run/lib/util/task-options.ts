const TYPE_NAMES = new Set(["string", "number", "boolean", "float", "int", "integer"]);

/**
 * Normalize task option specifications into @fynjs/cli-args compatible OptionSpec.
 * Supports:
 * - Native @fynjs/cli-args spec: { required: true, args: "<val string>", alias: "f" }
 * - Shorthand args without value name: { args: "<string>" } -> { args: "<val string>" }
 * - Legacy format: { require: true, type: "string", alias: "f" }
 * - Legacy array format: { type: "array" } -> { args: "[val string..]" }
 * - Legacy count format: { type: "count" } -> { counting: Infinity }
 *
 * @param {Record<string, any>} rawOpts - Raw options dictionary
 * @returns {Record<string, any>} Normalized options dictionary
 */
export function normalizeTaskOptions(rawOpts?: Record<string, any>): Record<string, any> {
  if (!rawOpts || typeof rawOpts !== "object") {
    return {};
  }
  const normalized: Record<string, any> = {};
  for (const [name, spec] of Object.entries(rawOpts)) {
    if (!spec || typeof spec !== "object") {
      continue;
    }
    const opt: any = { ...spec };
    // Support legacy `require: true`
    if (opt.require !== undefined && opt.required === undefined) {
      opt.required = Boolean(opt.require);
      delete opt.require;
    }
    // Support legacy `type: "string"` / `type: "array"` / `type: "count"`
    if (opt.type !== undefined && typeof opt.type === "string" && opt.args === undefined) {
      if (opt.type === "count") {
        opt.counting = opt.counting !== undefined ? opt.counting : Infinity;
      } else if (opt.type === "array") {
        opt.args = opt.required ? "<val string..>" : "[val string..]";
      } else {
        opt.args = `<val ${opt.type}>`;
      }
      delete opt.type;
    }
    // Normalize type-only angle or square brackets: `<string>` -> `<val string>`, `<array>` -> `<val string..>`
    if (typeof opt.args === "string") {
      opt.args = opt.args
        .replace(/^<([a-zA-Z]+)>$/, (_m, type) => {
          if (type === "array") {
            return "<val string..>";
          }
          return TYPE_NAMES.has(type) ? `<val ${type}>` : `<${type}>`;
        })
        .replace(/^\[([a-zA-Z]+)\]$/, (_m, type) => {
          if (type === "array") {
            return "[val string..]";
          }
          return TYPE_NAMES.has(type) ? `[val ${type}]` : `[${type}]`;
        });
    }
    normalized[name] = opt;
  }
  return normalized;
}

/**
 * Extract and normalize option specifications for a given task definition.
 *
 * @param {any} task - Task item or task object
 * @returns {{ options: Record<string, any>, commands: Record<string, any>, allowUnknownOption?: boolean }}
 */
export function getTaskOptionSpec(task: any): {
  options: Record<string, any>;
  commands: Record<string, any>;
  allowUnknownOption?: boolean;
} {
  const item = task?.item || task || {};
  const cliParser = item.cliParser || task?.cliParser || {};
  const rawOpts = item.argOpts || cliParser.options || task?.argOpts;
  const options = normalizeTaskOptions(rawOpts);
  const commands = cliParser.commands || {};
  const allowUnknownOption =
    cliParser.allowUnknownOption !== undefined
      ? cliParser.allowUnknownOption
      : item.allowUnknownOption !== undefined
      ? item.allowUnknownOption
      : undefined;

  return { options, commands, allowUnknownOption };
}

export default {
  normalizeTaskOptions,
  getTaskOptionSpec
};

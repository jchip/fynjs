/* eslint-disable prefer-spread */

import assert from "node:assert";

/**
 * A trace record describing where a config value's value came from.
 */
export interface XenvConfigTrace {
  /** source(s) the value was resolved from, e.g. "env", "option", "default", or a comma joined list for merged json values */
  src: string;
  /** the env var name that was used, when src includes "env" */
  name?: string;
}

/**
 * Spec for a single config key.
 */
export interface XenvConfigSpecOption {
  /**
   * env var name(s) to read the value from.
   * - `true`: use the config key itself as the env var name
   * - `string`: use this exact env var name
   * - `string[]`: use the first env var name in the list that exists
   */
  env?: string | string[] | boolean;
  /** map raw env var string values to other values before further processing */
  envMap?: Record<string, unknown>;
  /** value type used to coerce a found value */
  type?: string;
  /** default value, or a function that returns the default value */
  default?: unknown;
  /** transform the resolved value (and its trace) before it's placed in the result */
  post?: (value: unknown, trace: XenvConfigTrace) => unknown;
  [extra: string]: unknown;
}

/** Spec object mapping config keys to their `XenvConfigSpecOption`. */
export type XenvConfigSpec = Record<string, XenvConfigSpecOption>;

/** Env-like lookup object (defaults to `process.env`). */
export type XenvConfigEnv = Record<string, unknown>;

/** User supplied config values, keyed the same as `spec`. */
export type XenvConfigUserConfig = Record<string, unknown>;

/** A merge function compatible with `Object.assign`'s signature (eg. lodash's `merge`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type XenvConfigMergeFn = (target: any, ...sources: any[]) => any;

/** Options controlling how `xenvConfig` resolves values. */
export interface XenvConfigOptions {
  /** override for `process.env` */
  _env?: XenvConfigEnv;
  /** merge function used to combine json-type values found from multiple sources */
  merge?: XenvConfigMergeFn;
  /** ordered list of sources to search; "default" is always appended */
  sources?: string[];
}

/** The resolved config object, plus a hidden `__$trace__` property describing value provenance. */
export type XenvConfigResult<T = Record<string, unknown>> = T & {
  readonly __$trace__: Record<string, XenvConfigTrace>;
};

type TypeGetter = (x: unknown, flagName?: string) => unknown;

const typeGetters: Record<string, TypeGetter> = {
  string: x => `${x}`,
  number: x => parseInt(x as string, 10),
  float: x => parseFloat(x as string),
  boolean: (x, flagName) => {
    assert(
      typeof x === "string",
      `xenv-config: [${flagName}] trying to convert non-string env value ${x} to boolean.`
    );
    const lower = x.toLowerCase();
    return lower === "true" || lower === "yes" || lower === "1" || lower === "on";
  },
  truthy: x => !!x,
  json: x => JSON.parse(x as string)
};

const getEnvName = (
  optKey: string,
  opt: XenvConfigSpecOption,
  env: XenvConfigEnv
): string | undefined => {
  if (!Object.prototype.hasOwnProperty.call(opt, "env")) return undefined;

  let name: string | undefined;

  if (Array.isArray(opt.env)) {
    name = opt.env.find(x => Object.prototype.hasOwnProperty.call(env, x));
  } else {
    name = opt.env === true ? optKey : (opt.env as string | undefined);
  }

  if (name && Object.prototype.hasOwnProperty.call(env, name)) {
    return name;
  }

  return undefined;
};

interface FoundValue {
  trace: XenvConfigTrace;
  value: unknown;
}

/**
 * Load config from env, user config, or default spec.
 *
 * @param spec - spec describing each config key
 * @param userConfig - user supplied config values
 * @param options - resolution options
 * @returns the resolved config object, with a non-enumerable `__$trace__` property
 */
const xenvConfig = <T = Record<string, unknown>>(
  spec: XenvConfigSpec,
  userConfig?: XenvConfigUserConfig,
  options?: XenvConfigOptions
): XenvConfigResult<T> => {
  const env: XenvConfigEnv = (options && options._env) || (process.env as XenvConfigEnv);
  const merge: XenvConfigMergeFn = (options && options.merge) || Object.assign;
  userConfig = userConfig || {};
  const trace: Record<string, XenvConfigTrace> = {};

  const getType = (opt: XenvConfigSpecOption): string => {
    const tod: false | string =
      Object.prototype.hasOwnProperty.call(opt, "default") && typeof opt.default;
    const type = opt.type || (tod !== "function" && tod) || "string";
    return type === "object" ? "json" : (type as string);
  };

  const getGetter = (opt: XenvConfigSpecOption): TypeGetter => {
    const type = getType(opt);
    return typeGetters[type] || typeGetters.string;
  };

  const getters: Record<string, (opt: XenvConfigSpecOption, k: string) => FoundValue | undefined> = {
    env: (opt, k) => {
      const name = getEnvName(k, opt, env);
      if (name) {
        const envVal = env[name];
        return {
          trace: { src: "env", name },
          value:
            opt.envMap && Object.prototype.hasOwnProperty.call(opt.envMap, envVal as string)
              ? opt.envMap[envVal as string]
              : getGetter(opt)(envVal, k)
        };
      }
      return undefined;
    },

    option: (opt, k) => {
      if (Object.prototype.hasOwnProperty.call(userConfig, k)) {
        return { trace: { src: "option" }, value: (userConfig as XenvConfigUserConfig)[k] };
      }
      return undefined;
    },

    default: opt => {
      if (Object.prototype.hasOwnProperty.call(opt, "default")) {
        return {
          trace: { src: "default" },
          value: typeof opt.default === "function" ? (opt.default as () => unknown)() : opt.default
        };
      }
      return undefined;
    }
  };

  const sources = (options && options.sources) || ["env", "option"];
  sources.push("default");

  const config = Object.keys(spec).reduce((cfg: Record<string, unknown>, k) => {
    const opt = spec[k];
    const type = getType(opt);
    let found: FoundValue | undefined;

    if (type !== "json") {
      sources.find(s => (found = getters[s](opt, k)));
    } else {
      const mapped = sources.map(s => getters[s](opt, k)).filter((x): x is FoundValue => Boolean(x));
      if (mapped.length > 0) {
        found = {
          trace: { src: mapped.map(x => x.trace.src).join(",") },
          value: merge.apply(
            null,
            [{}].concat(mapped.map(x => x.value).reverse()) as [Record<string, unknown>, ...unknown[]]
          )
        };
      }
    }

    if (!found) return cfg;

    trace[k] = found.trace;
    cfg[k] = opt.post ? opt.post(found.value, found.trace) : found.value;

    return cfg;
  }, {});

  Object.defineProperty(config, "__$trace__", {
    enumerable: false,
    writable: false,
    value: trace
  });

  return config as XenvConfigResult<T>;
};

export default xenvConfig;

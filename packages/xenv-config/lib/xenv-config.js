"use strict";

/* eslint-disable prefer-spread */

const assert = require("assert");

const typeGetters = {
  string: x => `${x}`,
  number: x => parseInt(x, 10),
  float: x => parseFloat(x),
  boolean: (x, flagName) => {
    assert(
      typeof x === "string",
      `xenv-config: [${flagName}] trying to convert non-string env value ${x} to boolean.`
    );
    x = x.toLowerCase();
    return x === "true" || x === "yes" || x === "1" || x === "on";
  },
  truthy: x => !!x,
  json: x => JSON.parse(x)
};

const getEnvName = (optKey, opt, env) => {
  if (!opt.hasOwnProperty("env")) return undefined;

  let name;

  if (Array.isArray(opt.env)) {
    name = opt.env.find(x => env.hasOwnProperty(x));
  } else {
    name = opt.env === true ? optKey : opt.env;
  }

  if (name && env.hasOwnProperty(name)) {
    return name;
  }

  return undefined;
};

const xenvConfig = (spec, userConfig, options) => {
  const env = (options && options._env) || process.env;
  const merge = (options && options.merge) || Object.assign;
  userConfig = userConfig || {};
  const trace = {};

  const getType = opt => {
    const tod = opt.hasOwnProperty("default") && typeof opt.default;
    const type = opt.type || (tod !== "function" && tod) || "string";
    return type === "object" ? "json" : type;
  };

  const getGetter = opt => {
    const type = getType(opt);
    return typeGetters[type] || typeGetters.string;
  };

  const getters = {
    env: (opt, k) => {
      const name = getEnvName(k, opt, env);
      if (name) {
        return { trace: { src: "env", name }, value: getGetter(opt)(env[name], k) };
      }
      return undefined;
    },

    option: (opt, k) => {
      if (userConfig.hasOwnProperty(k)) {
        return { trace: { src: "option" }, value: userConfig[k] };
      }
      return undefined;
    },

    default: opt => {
      if (opt.hasOwnProperty("default")) {
        return {
          trace: { src: "default" },
          value: typeof opt.default === "function" ? opt.default() : opt.default
        };
      }
      return undefined;
    }
  };

  const sources = (options && options.sources) || ["env", "option"];
  sources.push("default");

  const config = Object.keys(spec).reduce((cfg, k) => {
    const opt = spec[k];
    const type = getType(opt);
    let found;

    if (type !== "json") {
      sources.find(s => (found = getters[s](opt, k)));
    } else {
      const mapped = sources.map(s => getters[s](opt, k)).filter(x => x);
      if (mapped.length > 0) {
        found = {
          trace: { src: mapped.map(x => x.trace.src).join(",") },
          value: merge.apply(null, [{}].concat(mapped.map(x => x.value).reverse()))
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

  return config;
};

module.exports = xenvConfig;

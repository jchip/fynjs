"use strict";

const typeGetters = {
  string: x => x,
  number: x => parseInt(x, 10),
  float: x => parseFloat(x),
  boolean: x => {
    x = x.toLowerCase();
    return x === "true" || x === "yes" || x === "1" || x === "on";
  },
  truthy: x => !!x
};

const getEnvName = (optKey, opt) => {
  if (!opt.hasOwnProperty("env")) return undefined;

  let name;

  if (Array.isArray(opt.env)) {
    name = opt.env.find(x => process.env.hasOwnProperty(x));
  } else {
    name = opt.env === true ? optKey : opt.env;
  }

  if (name && process.env.hasOwnProperty(name)) {
    return name;
  }

  return undefined;
};

const xenvConfig = (spec, userConfig, options) => {
  userConfig = userConfig || {};
  const trace = {};

  const getters = {
    env: (opt, k) => {
      const name = getEnvName(k, opt);
      if (name) {
        const type = opt.type || (opt.hasOwnProperty("default") && typeof opt.default) || "string";
        const getter = typeGetters[type] || typeGetters.string;
        return { trace: { src: "env", name }, value: getter(process.env[name]) };
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
        return { trace: { src: "default" }, value: opt.default };
      }
      return undefined;
    }
  };

  const sources = (options && options.sources) || ["env", "option"];
  sources.push("default");

  const config = Object.keys(spec).reduce((cfg, k) => {
    const opt = spec[k];
    let found;

    sources.find(s => (found = getters[s](opt, k)));

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

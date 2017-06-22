"use strict";

const assert = require("assert");

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

const xenvConfig = (spec, userConfig) => {
  userConfig = userConfig || {};
  const trace = {};

  const config = Object.keys(spec).reduce((config, k) => {
    const opt = spec[k];

    let env;
    const getFromEnv = optEnv => {
      if (Array.isArray(optEnv)) {
        env = optEnv.find(x => process.env.hasOwnProperty(x));
        return env ? process.env[env] : undefined;
      }
      env = optEnv;
      return process.env.hasOwnProperty(env) ? process.env[env] : undefined;
    };

    // always use env if it's not undefined
    let envX;
    if (opt.hasOwnProperty("env") && (envX = getFromEnv(opt.env)) !== undefined) {
      const type = opt.type || (opt.hasOwnProperty("default") && typeof opt.default) || "string";
      const getter = typeGetters[type] || typeGetters.string;
      trace[k] = { src: "env", name: env };
      config[k] = getter(envX);
      return config;
    }

    // use options if it exists
    if (userConfig.hasOwnProperty(k)) {
      trace[k] = { src: "option" };
      config[k] = userConfig[k];
      return config;
    }

    // use default if it exists
    if (opt.hasOwnProperty("default")) {
      trace[k] = { src: "default" };
      config[k] = opt.default;
    }

    return config;
  }, {});

  Object.defineProperty(config, "__$trace__", {
    enumerable: false,
    writable: false,
    value: trace
  });

  return config;
};

module.exports = xenvConfig;

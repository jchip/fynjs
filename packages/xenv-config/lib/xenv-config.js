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

const xenvConfig = (spec, userConfig) => {
  userConfig = userConfig || {};
  const trace = {};

  /* eslint-disable max-statements */
  const config = Object.keys(spec).reduce((cfg, k) => {
    const opt = spec[k];
    const post = opt.post || (v => v);

    let env;
    const getFromEnv = optEnv => {
      if (Array.isArray(optEnv)) {
        env = optEnv.find(x => process.env.hasOwnProperty(x));
        return env ? process.env[env] : undefined;
      }

      env = optEnv === true ? k : optEnv;

      return process.env.hasOwnProperty(env) ? process.env[env] : undefined;
    };

    // always use env if it's not undefined
    let envX;
    if (opt.hasOwnProperty("env") && (envX = getFromEnv(opt.env)) !== undefined) {
      const type = opt.type || (opt.hasOwnProperty("default") && typeof opt.default) || "string";
      const getter = typeGetters[type] || typeGetters.string;
      trace[k] = { src: "env", name: env };
      cfg[k] = post(getter(envX), trace[k]);
      return cfg;
    }

    // use options if it exists
    if (userConfig.hasOwnProperty(k)) {
      trace[k] = { src: "option" };
      cfg[k] = post(userConfig[k], trace[k]);
      return cfg;
    }

    // use default if it exists
    if (opt.hasOwnProperty("default")) {
      trace[k] = { src: "default" };
      cfg[k] = post(opt.default, trace[k]);
    }

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

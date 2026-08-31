"use strict";

// exports its register on the `plugin` field
exports.plugin = (server, options, next) => {
  server.decorate("fromPluginField", true);
  next();
};

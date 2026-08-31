"use strict";

// exports on `default`, the ES-module interop shape
exports.default = (server, options, next) => {
  server.decorate("fromDefaultField", true);
  next();
};

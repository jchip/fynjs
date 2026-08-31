"use strict";

// the module itself is the register function
module.exports = (server, options, next) => {
  server.decorate("fromModuleItself", true);
  next();
};

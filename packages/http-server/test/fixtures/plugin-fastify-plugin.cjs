"use strict";

// exports its register on the `fastifyPlugin` field - the first field looked for
exports.fastifyPlugin = {
  register: (server, options, next) => {
    server.decorate("fromFastifyPluginField", options.marker || "yes");
    next();
  }
};

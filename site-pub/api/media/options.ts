"use strict";

import { NixClap, CommandExecFunc } from "@fynjs/cli-args";

const nc = new NixClap({
  allowUnknownCommand: true,
  allowUnknownOption: true
}).init2({
  options: {
    a: {
      alias: "a",
      args: "< string>"
    },
    l: {
      alias: "l",
      args: "< string>",
      argDefault: null
    }
  }
});

const r = nc.parse(["-a", "50"], 0);

console.log(JSON.stringify(r.command.jsonMeta, null, 2));

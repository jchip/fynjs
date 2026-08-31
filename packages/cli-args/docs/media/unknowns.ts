"use strict";

import { NixClap, CommandExecFunc } from "@fynjs/cli-args";

const nc = new NixClap({
  allowUnknownCommand: true,
  allowUnknownOption: true
});

const r = nc.init2({}).parse(["foo", "-a=50", "--bar=60"], 0);

console.log(r.command.subCmdNodes.foo.options);

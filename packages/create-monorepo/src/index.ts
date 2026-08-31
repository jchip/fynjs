import { create } from "./create.js";
// @fynjs/cli-args 2.x exports a named `NixClap` - unlike nix-clap 1.x, whose CJS
// `module.exports = NixClap` had no named export to destructure (see FPO-29).
import { NixClap } from "@fynjs/cli-args";

const nixClap = new NixClap()
  .usage("$0 [command] [options]")
  .init(
    {},
    {
      fynpo: {
        exec: create,
        args: "[dir]",
        desc: "Create a new fynpo monorepo",
        // every invocation is routed through the fynpo command (see start below), so its
        // options live on the command - that also puts them in `create-monorepo --help`
        options: {
          commitlint: {
            args: "[ boolean]",
            argDefault: "true",
            desc: "no-commitlint to skip commitlint configuration",
          },
        },
      },
    }
  );

async function start() {
  if (process.argv.length > 2) {
    // if command is not recognize, then default to fynpo and use it as dir arg
    if (!["fynpo"].includes(process.argv[2])) {
      const argv = ([] as string[]).concat(
        process.argv.slice(0, 2),
        "fynpo",
        process.argv.slice(2)
      );
      // parseAsync so the async exec handler runs to completion before we return
      return nixClap.parseAsync(argv, 2);
    }
  }
  return nixClap.parseAsync();
}

await start();

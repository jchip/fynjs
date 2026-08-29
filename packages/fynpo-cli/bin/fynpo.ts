#!/usr/bin/env node

import { makeOptionalRequire } from "optional-require";

const optionalRequire = makeOptionalRequire(process.cwd());

optionalRequire("fynpo/dist/fynpo-cli", {
  notFound: () => {
    console.error(`ERROR: Unable to find the fynpo module from dir ${process.cwd()}

Please make sure you are in a fynpo monorepo and you have installed fynpo
at its top level.
`);
    process.exit(1);
  },
  fail: (err: Error) => {
    console.error(
      `Fail to load fynpo for your monorepo from dir ${process.cwd()}
`,
      err
    );
    process.exit(1);
  }
});

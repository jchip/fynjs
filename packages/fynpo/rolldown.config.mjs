import Path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "rolldown";

const require = createRequire(import.meta.url);

/**
 * ESM output is required, not a preference: chalker uses top-level await (via optional-import to
 * reach ESM-only chalk), and no CJS output format can represent module-scope await. The old
 * webpack config also set `parser.javascript.importMeta: false`, which alone would break
 * chalker's `makeOptionalImport(import.meta)`.
 *
 * bin/fynpo.js stays CJS and reaches this bundle through a dynamic import.
 */

// `__dirname`/`__filename` do not exist in ESM. webpack left them as the CJS wrapper's runtime
// values (node: { __dirname: false }), which for a single-file bundle resolved to dist/.
const dirnameShim = [
  `import { fileURLToPath as __fynpoFileURLToPath } from "node:url";`,
  `import { dirname as __fynpoDirname } from "node:path";`,
  `const __filename = __fynpoFileURLToPath(import.meta.url);`,
  `const __dirname = __fynpoDirname(__filename);`
].join("\n");

/** node-gyp ships a Find-VisualStudio.cs that is not JavaScript - webpack used null-loader */
const nullCsPlugin = {
  name: "null-cs",
  load(id) {
    if (id.endsWith(".cs")) {
      return { code: "export default {};" };
    }
    return null;
  }
};

/**
 * shcmd (a shelljs fork) loads its commands with a computed require:
 *
 *   require('./commands').forEach(function (command) { require('./src/' + command); });
 *
 * webpack expanded that into a context module. Rolldown leaves it alone, so at runtime the
 * bundle tries to require './src/cat' relative to dist/ and dies with MODULE_NOT_FOUND.
 */
const shcmdCommandsPlugin = {
  name: "shcmd-static-commands",
  transform(code, id) {
    if (!id.replace(/\\/g, "/").endsWith("/shcmd/shell.js")) {
      return null;
    }

    const commands = require("shcmd/commands");
    const statik = commands.map(c => `require('./src/${c}');`).join("\n");
    const replaced = code.replace(
      /require\('\.\/commands'\)\.forEach\(function \(command\) \{\s*require\('\.\/src\/' \+ command\);\s*\}\);/,
      statik
    );

    if (replaced === code) {
      // fail loudly rather than shipping a bundle whose shell commands silently vanish
      throw new Error("shcmd-static-commands: command loader pattern not found in shcmd/shell.js");
    }

    return { code: replaced };
  }
};

const stub = name => Path.resolve(`stubs/${name}`);

export default defineConfig({
  input: Path.resolve("src/index.ts"),
  platform: "node",
  plugins: [nullCsPlugin, shcmdCommandsPlugin],
  //
  // import-fresh and resolve-global manipulate require and cannot be bundled; they stay in
  // dependencies via publishUtil. fyn is resolved at runtime from the install.
  //
  external: [
    "fyn",
    "fyn/package.json",
    "fyn/bin",
    "resolve-global",
    "global-dirs",
    "callsites",
    "resolve-from",
    "import-fresh",
    "parent-module",
    "ini"
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: true,
    alias: {
      xml2js: stub("xml2js.js"),
      "iconv-lite": stub("iconv-lite.js"),
      "./iconv-loader": stub("iconv-loader.js"),
      debug: stub("debug.js"),
      // the real require-at uses eval("require"), which makes node unable to determine the
      // module format of an ESM bundle that also has top-level await
      "require-at": stub("require-at.js"),
      // dedupe to the top-level optional-require 2.x: older nested copies still have
      // eval("require"), which breaks the ESM bundle the same way
      "optional-require": fileURLToPath(import.meta.resolve("optional-require")),
      "@commitlint/resolve-extends": stub("resolve-extends.js"),
      "./parser-flow.js": stub("parser-flow.js"),
      "./parser-typescript.js": stub("parser-typescript.js"),
      "./third-party.js": stub("parser-typescript.js"),
      "./parser-angular.js": stub("parser-flow.js"),
      "./parser-babel.js": stub("parser-flow.js"),
      "./parser-espree.js": stub("parser-flow.js"),
      "./parser-glimmer.js": stub("parser-flow.js"),
      "./parser-graphql.js": stub("parser-flow.js"),
      "./parser-html.js": stub("parser-flow.js"),
      "./parser-markdown.js": stub("parser-flow.js"),
      "./parser-meriyah.js": stub("parser-flow.js"),
      "./parser-postcss.js": stub("parser-flow.js"),
      "./parser-yaml.js": stub("parser-flow.js"),
      "util/types": stub("util-types.js")
    }
  },
  output: {
    file: "dist/bundle.mjs",
    format: "esm",
    banner: dirnameShim,
    minify: false,
    inlineDynamicImports: true,
    // the monorepo baseline (package.json engines: node >=22.12.0). The webpack build ran
    // everything through babel targeting node 8, which is long dead and only added output size.
    target: "node22"
  }
});

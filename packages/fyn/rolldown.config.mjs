import Path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "rolldown";

const require = createRequire(import.meta.url);

/**
 * ESM output is required, not a preference: chalker uses top-level await (via optional-import
 * to reach ESM-only chalk), and no CJS output format can represent module-scope await. ESM also
 * keeps `import.meta` and dynamic `import(url)` intact, both of which webpack mangled.
 *
 * bin/fyn.js stays CJS and reaches this bundle through a dynamic import.
 */

// `__dirname`/`__filename` do not exist in ESM. webpack left them as the CJS wrapper's runtime
// values (node: { __dirname: false }), which for a single-file bundle resolved to dist/.
// Re-create exactly that from import.meta.url so the 8 call sites in cli/ and lib/ keep working.
const banner = [
  `import { fileURLToPath as __fynFileURLToPath } from "node:url";`,
  `import { dirname as __fynDirname } from "node:path";`,
  `import { createRequire as __fynCreateRequire } from "node:module";`,
  `const __filename = __fynFileURLToPath(import.meta.url);`,
  `const __dirname = __fynDirname(__filename);`,
  // stand-in for the `eval("require")` that CJS packages use to escape bundlers - see
  // evalRequirePlugin. Resolves from dist/, matching what the eval'd require resolved to
  // under webpack.
  `const __fynRequire = __fynCreateRequire(import.meta.url);`
].join("\n");

/**
 * A number of CJS packages hide their require from bundlers with `eval("require")`. In an ESM
 * bundle that also has top-level await, node cannot classify such a module and throws
 * ERR_AMBIGUOUS_MODULE_SYNTAX at load. Swap the eval for a real createRequire, which is what
 * those packages actually want.
 *
 * The optional-require dedupe below covers the one case known to reach this bundle today; this
 * plugin keeps a new dependency doing the same trick from breaking it.
 */
const evalRequirePlugin = {
  name: "replace-eval-require",
  transform(code) {
    if (!/eval\(\s*(["'])require\1\s*\)/.test(code)) {
      return null;
    }
    return { code: code.replace(/eval\(\s*(["'])require\1\s*\)/g, "__fynRequire") };
  }
};

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
 * The command list is static, so expand the loop into explicit requires at build time.
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

export default defineConfig({
  input: Path.resolve("cli/main.ts"),
  platform: "node",
  plugins: [nullCsPlugin, shcmdCommandsPlugin, evalRequirePlugin],
  resolve: {
    extensions: [".ts", ".js", ".json"],
    symlinks: true,
    alias: {
      xml2js: Path.resolve("stubs/xml2js.js"),
      "iconv-lite": Path.resolve("stubs/iconv-lite.js"),
      "./iconv-loader": Path.resolve("stubs/iconv-loader.js"),
      debug: Path.resolve("stubs/debug.js"),
      // dedupe to the top-level optional-require 2.1.1+, which ships no dependencies and no
      // eval'd require. A nested 1.1.10 copy still pulls in require-at, whose eval'd require
      // makes node unable to determine the module format of an ESM bundle that also has
      // top-level await. 2.x is API compatible.
      "optional-require": fileURLToPath(import.meta.resolve("optional-require")),
      // dedupe chalk to fyn's own copy. lib/ statically imports chalk in 10 places, and
      // chalker/chalk imports it too - without this, chalker resolves the chalk 6 in its own
      // node_modules and the bundle carries two chalks with independent color-support state.
      chalk: fileURLToPath(import.meta.resolve("chalk")),
      // fyn imports lodash sub-paths, but other modules pull it in whole - override with the
      // minified copy when bundling, same as the webpack build did.
      lodash: require.resolve("lodash/lodash.min.js"),
      "resolve-from": Path.resolve("stubs/resolve-from.js")
    }
  },
  output: {
    file: "dist/fyn.mjs",
    format: "esm",
    banner,
    minify: false,
    inlineDynamicImports: true,
    // the monorepo baseline (package.json engines: node >=22.12.0). The webpack build
    // transpiled everything down to node18, below what fyn actually supports.
    target: "node22"
  }
});

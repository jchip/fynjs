import Path from "node:path";
import { createRequire } from "node:module";
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
const dirnameShim = [
  `import { fileURLToPath as __fynFileURLToPath } from "node:url";`,
  `import { dirname as __fynDirname } from "node:path";`,
  `const __filename = __fynFileURLToPath(import.meta.url);`,
  `const __dirname = __fynDirname(__filename);`
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

export default defineConfig({
  input: Path.resolve("cli/main.ts"),
  platform: "node",
  plugins: [nullCsPlugin],
  resolve: {
    extensions: [".ts", ".js", ".json"],
    symlinks: true,
    alias: {
      xml2js: Path.resolve("stubs/xml2js.js"),
      "iconv-lite": Path.resolve("stubs/iconv-lite.js"),
      "./iconv-loader": Path.resolve("stubs/iconv-loader.js"),
      debug: Path.resolve("stubs/debug.js"),
      // fyn imports lodash sub-paths, but other modules pull it in whole - override with the
      // minified copy when bundling, same as the webpack build did.
      lodash: require.resolve("lodash/lodash.min.js"),
      "resolve-from": Path.resolve("stubs/resolve-from.js")
    }
  },
  output: {
    file: "dist/fyn.mjs",
    format: "esm",
    banner: dirnameShim,
    minify: false,
    inlineDynamicImports: true
  }
});

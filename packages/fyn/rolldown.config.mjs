import Path from "node:path";
import { createRequire, isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "rolldown";

const require = createRequire(import.meta.url);

/**
 * ESM output is required, not a preference: chalker uses top-level await (via optional-import
 * to reach ESM-only chalk), and no CJS output format can represent module-scope await. ESM also
 * keeps `import.meta` and dynamic `import(url)` intact, both of which webpack mangled.
 *
 * bin/fyn.mjs reaches this bundle through a dynamic import - see bin/index.mjs for why the
 * specifier is a URL computed at runtime rather than a literal.
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

/**
 * A package's `import ... from "http"`, or a top-level `require("http")` that rolldown hoists,
 * ends up as a static ESM import in the bundle. Node builds the ESM facade of a builtin by
 * reading every export, and node:http's lazy getters then load its internal undici - about 5ms
 * of startup that a repeat install never uses. A runtime require leaves those getters alone.
 */
const requireHttpAtRuntimePlugin = {
  name: "require-http-at-runtime",
  transform(code, id) {
    if (!id.includes("node_modules") || !/(["'])(node:)?https?\1/.test(code)) {
      return null;
    }
    const mod = `((?:node:)?https?)`;
    const replaced = code
      .replace(new RegExp(`\\brequire\\(\\s*(["'])${mod}\\1\\s*\\)`, "g"), '__fynRequire("$2")')
      .replace(
        new RegExp(`^import\\s*\\*\\s*as\\s+([\\w$]+)\\s+from\\s*(["'])${mod}\\2;?`, "gm"),
        'const $1 = __fynRequire("$3");'
      )
      .replace(
        new RegExp(`^import\\s*\\{([^}]*)\\}\\s*from\\s*(["'])${mod}\\2;?`, "gm"),
        (_m, names, _q, m) => `const {${names.replace(/\s+as\s+/g, ": ")}} = __fynRequire("${m}");`
      );
    return replaced === code ? null : { code: replaced };
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

/**
 * arborist turns on its debug-only assertions when `process.cwd()` is its own package dir,
 * which it finds as `path.resolve(__dirname, "..")`. Bundled, `__dirname` is dist/, so that
 * dir becomes fyn's own package, and running fyn there makes loadActual throw on fyn's layout
 * ("dev edges on non-top node"). Drop just that clause; ARBORIST_DEBUG=1 still opts in.
 */
const arboristDebugPlugin = {
  name: "arborist-debug-cwd",
  transform(code, id) {
    if (!id.replace(/\\/g, "/").endsWith("/@npmcli/arborist/lib/debug.js")) {
      return null;
    }

    const clause = "process.cwd() === require('node:path').resolve(__dirname, '..')";
    if (!code.includes(clause)) {
      // fail loudly rather than ship a bundle where running fyn in its own dir breaks again
      throw new Error("arborist-debug-cwd: cwd clause not found in @npmcli/arborist/lib/debug.js");
    }

    return { code: code.replace(clause, "false") };
  }
};

/**
 * agent-base keeps `protocol` in state its constructor creates after `super()`, so the
 * `this.protocol = "http:"` that http.Agent sets is dropped. Every read of `agent.protocol`, which
 * node does on each request, then guesses from `new Error().stack`. @npmcli/agent's getAgent
 * caches one agent per protocol, so set it there.
 */
const agentProtocolPlugin = {
  name: "agent-protocol",
  transform(code, id) {
    if (!id.replace(/\\/g, "/").endsWith("/@npmcli/agent/lib/index.js")) {
      return null;
    }

    const anchor = "const newAgent = new Agent(normalizedOptions)\n";
    if (!code.includes(anchor)) {
      // fail loudly rather than ship a bundle that's quietly slow again
      throw new Error("agent-protocol: new Agent(normalizedOptions) not found in @npmcli/agent/lib/index.js");
    }

    return { code: code.replace(anchor, anchor + "newAgent.protocol = url.protocol\n") };
  }
};

/**
 * cacache makes the cache dir and writes its CACHEDIR.TAG with `wx` before every write, so each
 * one after the first fails with EEXIST - thousands of thrown errors per install. Do it once per
 * cache dir.
 */
const cacacheDirOncePlugin = {
  name: "cacache-dir-once",
  transform(code, id) {
    if (!id.replace(/\\/g, "/").endsWith("/cacache/lib/util/cache-dir.js")) {
      return null;
    }

    const fn = "async function mkdir (cache) {\n  await fs.mkdir(cache, { recursive: true, owner: 'inherit' })\n  await writeTag(cache)\n}";
    if (!code.includes(fn)) {
      throw new Error("cacache-dir-once: mkdir not found in cacache/lib/util/cache-dir.js");
    }

    const once =
      "const made = new Map()\n" +
      "function mkdir (cache) {\n" +
      "  let p = made.get(cache)\n" +
      "  if (!p) {\n" +
      "    p = fs.mkdir(cache, { recursive: true, owner: 'inherit' }).then(() => writeTag(cache))\n" +
      "    made.set(cache, p)\n" +
      "    p.catch(() => made.delete(cache))\n" +
      "  }\n" +
      "  return p\n" +
      "}";
    return { code: code.replace(fn, once) };
  }
};

/**
 * Rolldown only warns on an unresolved import and leaves it in the bundle as an external. fyn
 * ships as a single bundle with its dependencies stripped (publishUtil.remove), so any external
 * other than a node builtin fails at runtime - e.g. a workspace dep whose dist/ is missing.
 *
 * Check here rather than in onLog: rolldown emits the UNRESOLVED_IMPORT log after it has already
 * written dist/fyn.mjs, so failing there still leaves the broken bundle on disk. Throwing in
 * generateBundle stops the write.
 */
const noExternalsPlugin = {
  name: "no-externals",
  generateBundle(_options, bundle) {
    const externals = Object.values(bundle)
      .flatMap(chunk => (chunk.type === "chunk" ? chunk.imports : []))
      .filter(id => !isBuiltin(id));
    if (externals.length > 0) {
      throw new Error(`no-externals: unresolved imports left in bundle: ${externals.join(", ")}`);
    }
  }
};

const fynConfig = {
  input: Path.resolve("cli/main.ts"),
  platform: "node",
  plugins: [
    nullCsPlugin,
    shcmdCommandsPlugin,
    evalRequirePlugin,
    requireHttpAtRuntimePlugin,
    arboristDebugPlugin,
    agentProtocolPlugin,
    cacacheDirOncePlugin,
    noExternalsPlugin
  ],
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
      "resolve-from": Path.resolve("stubs/resolve-from.js")
    }
  },
  // Syntax lowering target. This belongs on `transform`, not `output` - rolldown rejects
  // `output.target` with "Invalid key: Expected never but received target" and carries on with
  // its default of `esnext`, so the target the config claimed was never actually applied.
  //
  // Keep this in lockstep with three things that must agree: package.json engines
  // (floor 22.22.2), bin/check-node.mjs MIN_NODE, and the lowest leg of the CI matrix. Lowering it
  // below the floor ships syntax fyn claims not to need; raising it above ships syntax that
  // check-node.mjs would wave straight through into a parse error.
  transform: {
    target: "node22.22"
  },
  output: {
    file: "dist/fyn.mjs",
    format: "esm",
    banner,
    minify: false,
    codeSplitting: false
  }
};

/**
 * The fs worker runs in its own thread, so it's a bundle of its own next to fyn.mjs, where
 * lib/util/fs-worker-pool.ts looks for it. It needs only tar and ssri.
 */
const fsWorkerConfig = {
  input: Path.resolve("lib/util/fs-worker.ts"),
  platform: "node",
  plugins: [noExternalsPlugin],
  resolve: { extensions: [".ts", ".js", ".json"], symlinks: true },
  transform: fynConfig.transform,
  output: {
    file: "dist/fs-worker.mjs",
    format: "esm",
    minify: false,
    codeSplitting: false
  }
};

export default defineConfig([fynConfig, fsWorkerConfig]);

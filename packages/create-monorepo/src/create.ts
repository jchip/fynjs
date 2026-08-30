import Path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import _ from "lodash";
import type { CommandExecFunc } from "nix-clap";

// nix-clap 2.x does not export its CommandNode class type directly - derive the exec
// handler's command parameter type from the exported exec function signature
type ExecCommand = Parameters<CommandExecFunc>[0];

// the package.json template is a CJS factory module (templates/_package.cjs) - this package is
// ESM, so reach it through a real require from node:module
const cjsRequire = createRequire(import.meta.url);

import { loadCk } from "./ck.js";
import { copyTemplate, sortPackageDeps, getCommitLintSetting } from "./utils.js";
import { prepareFynpoDir, checkDir } from "./prep-fynpo-dir.js";
import { ParsedOpts } from "./interfaces.js";
import { isGitInitialized, initializeGitRepo } from "./initialize-git.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

export async function createFynpo(targetDir: string, opts: ParsedOpts) {
  const fynpoDir = await prepareFynpoDir(targetDir);
  const dirOk = await checkDir(fynpoDir);

  if (!dirOk) {
    console.log(`Not able to write to directory '${fynpoDir}'. bye.`);
    return;
  }

  const isGit = await isGitInitialized();

  if (!isGit) {
    console.log("Initializing Git repository");
    await initializeGitRepo();
  }

  const commitlint = opts && opts.commitlint;
  const srcDir = Path.join(dirname, "../templates");
  const configFile = commitlint ? "fynpo.config.js" : "fynpo.json";
  const fynpoRc = {
    changeLogMarkers: ["## Packages", "## Commits"],
    command: { publish: { tags: {}, versionTagging: {} } },
  };

  const files = {
    packages: { dir: true, fromTemplate: false },
    _gitignore: { destName: ".gitignore" },
    _npmrc: { destName: ".npmrc" },
    [configFile]: {
      fromTemplate: commitlint ? true : false,
      loader: !commitlint ? () => `${JSON.stringify(fynpoRc, null, 2)}\n` : undefined,
    },
    "README.md": {},
    "_package.cjs": {
      loader: (filename) => {
        let pkg;
        const makePkg = cjsRequire(filename);
        if (commitlint) {
          const lint = getCommitLintSetting();
          pkg = makePkg(lint, _.merge);
        } else {
          pkg = makePkg({}, _.merge);
        }
        sortPackageDeps(pkg);
        return `${JSON.stringify(pkg, null, 2)}\n`;
      },
      destName: "package.json",
    },
  };

  await copyTemplate(srcDir, process.cwd(), {
    ...files,
  });

  const commitHookMsg = commitlint
    ? `\nTo add commit hooks, please run:
        <cyan>
        npx husky add .husky/commit-msg 'npx --no-install fynpo commitlint --edit $1'</>
        `
    : "";

  const ck = await loadCk();

  console.log(ck`
Successfully initialized fynpo monorepo in directory '${fynpoDir}'. To start development, please run:
<cyan>cd ${fynpoDir}
fyn</>
${commitHookMsg}
`);
}

export async function create(cmd: ExecCommand): Promise<void> {
  // nix-clap 2.x exec handlers receive the parsed command node; jsonMeta carries the
  // command's args plus options inherited from the root command
  const meta = cmd.jsonMeta;
  const dir = (meta.args?.dir as string) || ".";
  return await createFynpo(dir, meta.opts as ParsedOpts);
}

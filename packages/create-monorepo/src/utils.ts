import Fs, { mkdirSync } from "node:fs";
import Path from "node:path";
import { fileURLToPath } from "node:url";
import { fromPairs, sortBy, toPairs } from "lodash-es";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

export const sortObjKeys = <T extends Record<string, any>>(obj: T): T =>
  fromPairs(sortBy(toPairs(obj), 0)) as T;

export const sortPackageDeps = (pkg) => {
  ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].forEach((x) => {
    if (pkg[x]) {
      const dep = {};
      for (const key in pkg[x]) {
        if (pkg[x][key] !== "-") {
          dep[key] = pkg[x][key];
        }
      }
      pkg[x] = sortObjKeys(dep);
    }
  });
};

export const myPkg = JSON.parse(Fs.readFileSync(Path.join(dirname, "../package.json"), "utf-8"));

/**
 * Replace each `{{name}}` dependency range in the template with create-monorepo's own
 * devDependency range for that package. fynpo rewrites those ranges on every release of the
 * package, so a scaffolded repo always gets the versions this release was built with.
 */
export const fillTemplateVersions = (pkg, ownDevDeps = myPkg.devDependencies || {}) => {
  ["dependencies", "devDependencies"].forEach((sec) => {
    for (const name in pkg[sec] || {}) {
      const placeholder = /^\{\{(.+)\}\}$/.exec(pkg[sec][name]);
      if (!placeholder) continue;
      const range = ownDevDeps[placeholder[1]];
      if (!range) {
        throw new Error(`create-monorepo has no ${placeholder[1]} devDependency to fill the template's ${name} range`);
      }
      pkg[sec][name] = range;
    }
  });
};

export function getCommitLintSetting() {
  return {
    scripts: {
      prepare: "husky install",
    },
    devDependencies: {
      "@commitlint/config-conventional": "^12.0.1",
      husky: "^5.1.3",
    },
  };
}

export async function copyTemplate(srcTmplDir, destDir, filesList) {
  const destFile = (name) => Path.join(destDir, name);

  for (const name in filesList) {
    const file = filesList[name];
    const fullSrc = Path.join(srcTmplDir, name);

    if (!Fs.existsSync(fullSrc) && file.fromTemplate !== false) {
      continue;
    }

    if (file.dir) {
      mkdirSync(destFile(file.destName || name), { recursive: true });
    } else if (file.processor) {
      const content = Fs.readFileSync(fullSrc, "utf-8");
      Fs.writeFileSync(destFile(file.destName || name), file.processor(content));
    } else if (file.loader) {
      const content = file.loader(fullSrc);
      Fs.writeFileSync(destFile(file.destName || name), content);
    } else {
      Fs.copyFileSync(fullSrc, destFile(file.destName || name));
    }
  }
}

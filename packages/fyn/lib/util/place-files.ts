/*
 * Place a central store package's files into node_modules with sync calls, for the fs worker.
 * The same rules as FynCentral.replicate's async path: package.json is always copied, since fyn
 * rewrites it; a destination is unlinked, never written through (see hard-link-dir.ts); and a
 * link error that means the filesystem can't hardlink switches to clone or copy.
 */

import Fs from "node:fs";
import Path from "node:path";

/** link errors that mean the filesystem can't hardlink from the store at all */
export const NO_LINK_CODES = ["EXDEV", "EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS"];

export interface PlaceJob {
  srcDir: string;
  destDir: string;
  /** relative to srcDir and destDir */
  dirs: string[];
  files: string[];
  hardlink: boolean;
  reflink: boolean;
  copyFallback: boolean;
}

export interface PlaceResult {
  /** the error code when hardlinks stopped working, so the caller stops trying them */
  noLink?: string;
}

const copyNewSync = (src: string, dest: string, mode = 0): void => {
  try {
    Fs.copyFileSync(src, dest, mode | Fs.constants.COPYFILE_EXCL);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  Fs.unlinkSync(dest);
  Fs.copyFileSync(src, dest, mode | Fs.constants.COPYFILE_EXCL);
};

const linkSync = (src: string, dest: string): void => {
  try {
    Fs.linkSync(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    if (Fs.statSync(src).ino !== Fs.statSync(dest).ino) {
      Fs.unlinkSync(dest);
      Fs.linkSync(src, dest);
    }
  }
};

export function placeFilesSync(job: PlaceJob): PlaceResult {
  const { srcDir, destDir, reflink, copyFallback } = job;
  let hardlink = job.hardlink;
  let noLink: string | undefined;

  const cloneOrCopy = (src: string, dest: string): void => {
    if (reflink) {
      copyNewSync(src, dest, copyFallback ? Fs.constants.COPYFILE_FICLONE : Fs.constants.COPYFILE_FICLONE_FORCE);
    } else if (copyFallback) {
      copyNewSync(src, dest);
    } else {
      throw new Error(`fyn-central: can't place ${dest}: it can't be hardlinked, and reflink and copy-fallback are off`);
    }
  };

  for (const dir of job.dirs) {
    Fs.mkdirSync(Path.join(destDir, dir), { recursive: true });
  }

  for (const file of job.files) {
    const src = Path.join(srcDir, file);
    const dest = Path.join(destDir, file);
    if (file === "package.json") {
      // with reflink off, a copy is its only way in, not a fallback
      copyNewSync(src, dest, reflink && !copyFallback ? Fs.constants.COPYFILE_FICLONE_FORCE : 0);
    } else if (hardlink) {
      try {
        linkSync(src, dest);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code!;
        if (NO_LINK_CODES.includes(code)) {
          hardlink = false;
          noLink = code;
        } else if (code !== "EMLINK") {
          // EMLINK: this one file has too many links, so copy just it
          throw err;
        }
        cloneOrCopy(src, dest);
      }
    } else {
      cloneOrCopy(src, dest);
    }
  }

  return { noLink };
}

import { isWin32, retry } from "./base-util";

//
// This rather puzzling retry clutch here is very mysterious to me as well.
// For some reason, on Windows (mainly windows 10, many releases), either
// on a real machine or a VM, fs operations would fail with EACCESS or EPERM
// randomly, even on files that were just created two lines before or a few
// seconds before.  100 % of the time retrying a few times would work.
//
// This behavior affects npm (many versions) as well.
//
// Unfortunately, this also affects any external package or module that use fs,
// such as lockfile, and we need to retry calling their APIs.
//
const FS_RETRIES = isWin32 ? 10 : 0;
const FS_RETRY_ERRORS = isWin32 ? ["EACCESS", "EPERM"] : [];
const FS_RETRY_WAIT = 100;

const _retry = (func: () => Promise<unknown>) => retry(func, FS_RETRY_ERRORS, FS_RETRIES, FS_RETRY_WAIT);

export function wrapWin32Fs(fileOps: any) {
  if (isWin32) {
    return {
      ...fileOps,
      $: {
        ...fileOps.$,
        mkdirp: (...args: unknown[]) => _retry(() => fileOps.$.mkdirp(...args)),
        acquireLock: (...args: unknown[]) => _retry(() => fileOps.$.acquireLock(...args)),
        releaseLock: (...args: unknown[]) => _retry(() => fileOps.$.releaseLock(...args))
      },
      stat: (...args: unknown[]) => _retry(() => fileOps.stat(...args)),
      readFile: (...args: unknown[]) => _retry(() => fileOps.readFile(...args)),
      writeFile: (...args: unknown[]) => _retry(() => fileOps.writeFile(...args)),
      rename: (...args: unknown[]) => _retry(() => fileOps.rename(...args)),
      rmdir: (...args: unknown[]) => _retry(() => fileOps.rmdir(...args)),
      unlink: (...args: unknown[]) => _retry(() => fileOps.unlink(...args)),
      readdir: (...args: unknown[]) => _retry(() => fileOps.readdir(...args))
    };
  } else {
    return fileOps;
  }
}

export default wrapWin32Fs;

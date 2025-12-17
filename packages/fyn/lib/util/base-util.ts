/* eslint-disable max-params, no-param-reassign */

import _ from "lodash";
import * as xaa from "xaa";
import Promise from "./aveazul";

export const isWin32 = process.platform === "win32";

export function retry<T>(
  func: () => T | Promise<T>,
  checks: string[] | ((err: any) => boolean),
  tries: number,
  wait: number
): Promise<T> {
  let p = Promise.try(func);

  if (!_.isEmpty(checks) && tries > 0 && wait > 0) {
    p = p.catch((err: any) => {
      if (tries <= 0) throw err;
      tries--;
      return Promise.try(() =>
        Array.isArray(checks) ? checks.indexOf(err.code) >= 0 : checks(err)
      ).then((canRetry: boolean) => {
        if (!canRetry) throw err;
        return xaa.delay(wait).then(() => retry(func, checks, tries, wait));
      });
    });
  }

  return p;
}

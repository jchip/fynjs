/* eslint-disable no-param-reassign */

import Path from "path";

/**
 * Take a path and do "cd .." on it, pushing each new dir
 * into an array, until either:
 *
 * 1. Can't "cd .."" anymore
 * 2. The array stopping contains Path.basename(dir)
 *
 * stopping can also be a callback that returns true to
 * stop the process.
 *
 * @param path - starting path
 * @param stopping - array of dir names or callback to stop
 * @returns array of paths going up
 */
export function pathUpEach(path: string, stopping: string[] | ((path: string) => boolean)): string[] {
  const found: string[] = [];

  let stopFn: (path: string) => boolean;
  if (Array.isArray(stopping)) {
    const arr = stopping;
    stopFn = x => arr.indexOf(Path.basename(x)) >= 0;
  } else {
    stopFn = stopping;
  }

  while (path && path !== "." && !stopFn(path)) {
    found.push(path);
    const tmp = Path.join(path, "..");
    if (tmp === path) break;
    path = tmp;
  }

  return found;
}

export default pathUpEach;
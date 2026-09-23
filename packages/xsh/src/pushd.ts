import assert from "node:assert";

const stack: string[] = [];

/** Save the current working directory on a stack, then `chdir` into `dir`. */
export function pushd(dir: string): string {
  stack.push(process.cwd());
  process.chdir(dir);
  return process.cwd();
}

/** `chdir` back to the directory most recently saved by {@link pushd}. */
export function popd(): string {
  const dir = stack.pop();
  assert(dir !== undefined, "xsh.popd: directory stack is empty");
  process.chdir(dir);
  return dir;
}

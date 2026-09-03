import xsh from "xsh";

/**
 * Run a shell command through xsh with fynpo's standard environment.
 *
 * `PWD` is overridden along with `cwd` because child processes - npm lifecycle
 * scripts in particular - read `PWD` instead of calling getcwd(), so setting
 * `cwd` alone leaves them believing they are still in the monorepo root.
 *
 * @param command - shell command to run
 * @param cwd - directory to run it in
 * @param silent - suppress child output (default true; `publish` wants it false)
 */
export const execShell = (command: string, cwd: string, silent = true) =>
  xsh.exec(
    {
      silent,
      cwd,
      env: Object.assign({}, process.env, { PWD: cwd }),
    },
    command
  );

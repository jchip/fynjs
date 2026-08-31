import chalk from "chalk";
import { ErrorCommon } from "./error-common.js";

type FailureInfo = { reason: string; resolution: string };

/**
 * Explain, as loudly as possible, why the server failed to start.
 *
 * Each known failure code gets a human reason and a concrete resolution, which
 * is written to stderr along with the stack. The error is then rejected with
 * `message` prefixed by the reason and `moreInfo` carrying both halves.
 *
 * @param err - error from the failure
 * @returns a rejected promise carrying the annotated error
 */
export function startFailed(err: any): Promise<any> {
  const errors: Record<string, () => FailureInfo> = {
    EADDRINUSE: () => ({
      reason: `the network port (${err.port}) is already in use but your server is trying to listen to it`,
      resolution: `
      Ensure no other processes are running on this port, or change the port
      your server should listen on.

      To identify which process is listening on port ${err.port} run this command:
    lsof -i :${err.port}
`
    }),

    unknown: () => ({
      reason: `There was an error starting the Fastify server.`,
      resolution: `
      This generally is not related to Fastify or @fynjs/http-server.
      The most likely cause is you have a Fastify plugin that's misbehaving.
      Please check the output of the stack trace below and correct the error shown
`
    }),

    XEVENT_TIMEOUT: () => {
      const eventMsg = chalk.green(err.event);
      const nextMsg = chalk.magenta("next");
      const configMsg = chalk.green("config.electrode.eventTimeout");
      const timeoutMsg = chalk.green(err.timeout);
      const listenerMsg = chalk.green("config.listener");

      return {
        reason: `Your handler for event ${eventMsg} did not call ${nextMsg} within ${timeoutMsg} msec.`,
        resolution: `
      Event timeout is configured with '${configMsg}' (in milliseconds),
      and it is not enabled unless you set it to a non-zero value.
      If you need more time, then please set a longer timeout value.

      Please double check your event handler registered by your '${listenerMsg}'
      and make sure it completes and calls ${nextMsg}.
`
      };
    },

    XEVENT_FAILED: () => {
      const eventMsg = chalk.green(err.event);
      const listenerMsg = chalk.green("config.listener");

      return {
        reason: `@fynjs/http-server received error from your handler for event ${eventMsg}`,
        resolution: `
      Please double check and verify your event handler for ${eventMsg} registered by your '${listenerMsg}'.
`
      };
    },

    XPLUGIN_FAILED: () => {
      const name = err?.plugin?.__name || "unknown";
      return {
        reason: `failed registering your plugin '${name}' ${err.method}`,
        resolution: `
      Please double check and verify your plugin '${name}'.
`
      };
    }
  };

  const msg = (errors[err.code] || errors.unknown)();

  const stack = String(err.stack).split("\n");
  stack[0] = chalk.red(stack[0]);

  const errDetail = `
    ${chalk.bold.bgRed(ErrorCommon.errContext)}

    ${chalk.bold.red(msg.reason)}
    ${chalk.bold.red("message:")} ${err.message}

    ${chalk.bold.green("Suggestion to resolve the issue:")}
    ${chalk.inverse.bold.yellow(msg.resolution)}
    ${ErrorCommon.fileIssue}
    ${stack.join("\n")}
`;

  err.message = `${msg.reason}\n${err.message}`;
  err.moreInfo = msg;

  process.stderr.write(errDetail);

  return Promise.reject(err);
}

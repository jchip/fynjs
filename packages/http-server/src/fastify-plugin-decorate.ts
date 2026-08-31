import fastifyPlugin from "fastify-plugin";

const SKIP_OVERRIDE = Symbol.for("skip-override");

/**
 * Wrap a plugin's register with `fastify-plugin` so it shares the root
 * encapsulation context, which is what makes a plugin's decorations visible to
 * the rest of the server.
 *
 * Skipped when the plugin opts out with `fastifyPluginDecorate: false`, or when
 * its register was already wrapped (it carries the `skip-override` symbol).
 *
 * @param plugin - the plugin descriptor
 * @returns the same plugin descriptor
 */
export const fastifyPluginDecorate = (plugin: any) => {
  if (
    plugin.fastifyPluginDecorate !== false &&
    !Object.prototype.hasOwnProperty.call(plugin.register, SKIP_OVERRIDE)
  ) {
    fastifyPlugin(plugin.register, { name: plugin.__name, ...plugin.fastifyPluginDecorate });
  }

  return plugin;
};

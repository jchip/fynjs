export function prepare(options, token, suffix) {
  return {
    process: (context) => `${options.prefix}:${token.id}:${context.options.value}:${suffix}`,
  };
}

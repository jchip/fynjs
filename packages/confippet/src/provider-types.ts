/**
 * How a config partial provider behaves when its file is missing.
 *
 * - `required` - the file must exist
 * - `disabled` - do not run the provider at all
 * - `optional` - the file need not exist
 * - `warn` - log a warning if the file does not exist
 */
export const providerTypes = {
  required: "required",
  disabled: "disabled",
  optional: "optional",
  warn: "warn"
} as const;

export default providerTypes;

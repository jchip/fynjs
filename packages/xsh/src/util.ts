/**
 * Mutable holder for the Promise implementation xsh uses.
 *
 * Lives in its own module so exec reads the current value at call time,
 * while the setter is exposed as the `Promise` property on the xsh object.
 */
export const util: { Promise: PromiseConstructor } = {
  Promise
};

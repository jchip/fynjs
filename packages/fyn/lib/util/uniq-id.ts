/* eslint-disable no-magic-numbers,prefer-template */

/**
 * Generate a simple and fairly unique id
 * @returns unique id string
 */
export function uniqId(): string {
  return (
    Math.random()
      .toString(36)
      .substr(2, 10) +
    "_" +
    Date.now().toString(36)
  );
}

export default uniqId;
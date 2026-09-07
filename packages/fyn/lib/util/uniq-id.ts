
/**
 * Generate a simple and fairly unique id
 * @returns unique id string
 */
export function uniqId(): string {
  return (
    Math.random()
      .toString(36)
      .substring(2, 12) +
    "_" +
    Date.now().toString(36)
  );
}

export default uniqId;

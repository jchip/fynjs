/**
 * Sort object keys alphabetically
 * @param obj - Object to sort
 * @returns New object with sorted keys
 */
export function sortObjKeys<T extends Record<string, unknown> = Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  Object.keys(obj)
    .sort()
    .forEach(k => (sorted[k] = obj[k]));
  return sorted as T;
}

export default sortObjKeys;

// @ts-nocheck

/**
 * Sort object keys alphabetically
 * @param obj - Object to sort
 * @returns New object with sorted keys
 */
export function sortObjKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  Object.keys(obj)
    .sort()
    .forEach(k => (sorted[k] = obj[k]));
  return sorted;
}

export default sortObjKeys;
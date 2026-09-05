export interface Big {
  a: string;
  b: number;
}
type Alias = Big | null;
export function boom(_x: Alias): never {
  throw new Error("boom here");
}
boom(null);

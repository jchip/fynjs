import Path from "path";

export const unquote = (x: string): string => x.trim().replace(/^['"]+|['"]+$/g, "");

export const quote = (x: string): string => (!x.startsWith(`"`) ? `"${x}"` : x);

export const relative = (x: string, cwd?: string): string => {
  const r = Path.relative(cwd || process.cwd(), unquote(x));
  return r.startsWith(".") ? r : `.${Path.sep}${r}`;
};

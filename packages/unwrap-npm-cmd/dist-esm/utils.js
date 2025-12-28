import Path from "path";
export const unquote = (x) => x.trim().replace(/^['"]+|['"]+$/g, "");
export const quote = (x) => (!x.startsWith(`"`) ? `"${x}"` : x);
export const relative = (x, cwd) => {
    const r = Path.relative(cwd || process.cwd(), unquote(x));
    return r.startsWith(".") ? r : `.${Path.sep}${r}`;
};
//# sourceMappingURL=utils.js.map
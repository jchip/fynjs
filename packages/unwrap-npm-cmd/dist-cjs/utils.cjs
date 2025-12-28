"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relative = exports.quote = exports.unquote = void 0;
const tslib_1 = require("tslib");
const path_1 = tslib_1.__importDefault(require("path"));
const unquote = (x) => x.trim().replace(/^['"]+|['"]+$/g, "");
exports.unquote = unquote;
const quote = (x) => (!x.startsWith(`"`) ? `"${x}"` : x);
exports.quote = quote;
const relative = (x, cwd) => {
    const r = path_1.default.relative(cwd || process.cwd(), (0, exports.unquote)(x));
    return r.startsWith(".") ? r : `.${path_1.default.sep}${r}`;
};
exports.relative = relative;
//# sourceMappingURL=utils.cjs.map
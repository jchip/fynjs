"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultOutput = void 0;
const tslib_1 = require("tslib");
const log_update_1 = tslib_1.__importDefault(require("log-update"));
exports.defaultOutput = {
    isTTY: () => process.stdout.isTTY,
    write: (x) => process.stdout.write(x),
    visual: {
        write: log_update_1.default,
        clear: log_update_1.default.clear
    }
};
//# sourceMappingURL=default-output.cjs.map
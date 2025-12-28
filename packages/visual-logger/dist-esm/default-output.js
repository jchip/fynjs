import logUpdate from "log-update";
export const defaultOutput = {
    isTTY: () => process.stdout.isTTY,
    write: (x) => process.stdout.write(x),
    visual: {
        write: logUpdate,
        clear: logUpdate.clear
    }
};
//# sourceMappingURL=default-output.js.map
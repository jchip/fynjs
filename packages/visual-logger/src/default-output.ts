import logUpdate from "log-update";

export interface VisualOutput {
  write: (text: string) => void;
  clear: () => void;
}

export interface OutputInterface {
  isTTY: () => boolean | undefined;
  write: (text: string) => boolean;
  visual: VisualOutput;
}

export const defaultOutput: OutputInterface = {
  isTTY: () => process.stdout.isTTY,
  write: (x: string) => process.stdout.write(x),
  visual: {
    write: logUpdate,
    clear: logUpdate.clear
  }
};

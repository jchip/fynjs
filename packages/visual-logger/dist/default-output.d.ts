export interface VisualOutput {
    write: (text: string) => void;
    clear: () => void;
}
export interface OutputInterface {
    isTTY: () => boolean | undefined;
    write: (text: string) => boolean;
    visual: VisualOutput;
}
export declare const defaultOutput: OutputInterface;

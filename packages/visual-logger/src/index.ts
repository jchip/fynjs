export { VisualLogger, Levels, LevelColors, LogItemTypes } from "./visual-logger.ts";
export type {
  LogLevel,
  LogItemType,
  ItemOptions,
  UpdateData,
  VisualLoggerOptions
} from "./visual-logger.ts";

export { defaultOutput } from "./default-output.ts";
export type { VisualOutput, OutputInterface } from "./default-output.ts";

// Default export for backward compatibility
export { VisualLogger as default } from "./visual-logger.ts";

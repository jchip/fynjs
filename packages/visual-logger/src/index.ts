export { VisualLogger, Levels, LevelColors, LogItemTypes } from "./visual-logger.js";
export type {
  LogLevel,
  LogItemType,
  ItemOptions,
  UpdateData,
  VisualLoggerOptions
} from "./visual-logger.js";

export { defaultOutput } from "./default-output.js";
export type { VisualOutput, OutputInterface } from "./default-output.js";

// Default export for backward compatibility
export { VisualLogger as default } from "./visual-logger.js";

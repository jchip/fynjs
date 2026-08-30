// Global setup for vitest tests
import logger from "../lib/logger.js";

// Disable buffering for tests so console output can be intercepted
logger.buffering(false);
logger.quiet(false);

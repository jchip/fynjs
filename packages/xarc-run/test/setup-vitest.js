// Global setup for vitest tests
const logger = require("../lib/logger");

// Disable buffering for tests so console output can be intercepted
logger.buffering(false);
logger.quiet(false);

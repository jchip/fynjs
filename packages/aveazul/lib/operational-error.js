"use strict";

/**
 * OperationalError class for representing errors that are expected during normal operation
 * Similar to Bluebird's OperationalError
 */
class OperationalError extends Error {
  constructor(message) {
    super(message);
    this.name = "OperationalError";
    this.isOperational = true;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Check if an error is an operational error
 * @param {*} error - Error to check
 * @returns {boolean} True if the error is operational
 */
function isOperationalError(error) {
  if (!error || typeof error !== "object") return false;
  return error instanceof OperationalError || error.isOperational === true;
}

/**
 * Check if an error is a programmer error (unexpected, likely a bug)
 * @param {*} error - Error to check
 * @returns {boolean} True if the error is a programmer error
 */
function isProgrammerError(error) {
  if (!error || typeof error !== "object") return false;
  return !isOperationalError(error);
}

// Only export the OperationalError class
module.exports = {
  OperationalError,
  // Internal utilities used by AveAzul.prototype.error
  isOperationalError,
  isProgrammerError,
};

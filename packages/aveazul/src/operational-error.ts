/**
 * OperationalError class for representing errors that are expected during normal operation
 * Similar to Bluebird's OperationalError
 */
export class OperationalError extends Error {
  isOperational: boolean;

  constructor(message: string) {
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
 * @param error - Error to check
 * @returns True if the error is operational
 */
export function isOperationalError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (
    error instanceof OperationalError ||
    (error as { isOperational?: boolean }).isOperational === true
  );
}

/**
 * Check if an error is a programmer error (unexpected, likely a bug)
 * @param error - Error to check
 * @returns True if the error is a programmer error
 */
export function isProgrammerError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return !isOperationalError(error);
}

"use strict";

/**
 * CliContext encapsulates all CLI-related information from command line parsing
 * This provides a clean interface for accessing command arguments, options, and metadata
 * throughout the execution pipeline without tight coupling to CLI parsing details.
 */
class CliContext {
  constructor(cmdArgs) {
    // Full cmdArgs from CLI parsing
    this._cmdArgs = cmdArgs;
    this._parsed = cmdArgs.parsed;
    this._subCmdNodes = cmdArgs.cmdNodes || cmdArgs.parsed?.command?.subCmdNodes || {};
    this._opts = cmdArgs.opts;
    this._tasks = cmdArgs.tasks || [];
    this._searchResult = cmdArgs.searchResult;
    this._remainingArgs = cmdArgs.parsed?._ || [];
  }

  /**
   * Get command information for a specific task
   * @param {string} taskName - Name of the task
   * @returns {Object} Task command object with argv, opts, etc.
   */
  getTaskCommand(taskName) {
    return this._subCmdNodes[taskName] || {};
  }

  /**
   * Get argv array for a specific task
   * @param {string} taskName - Name of the task
   * @returns {Array} Task arguments array
   */
  getTaskArgv(taskName) {
    return this.getTaskCommand(taskName).argv || [];
  }

  /**
   * Get global command line options
   * @returns {Object} Global options object
   */
  getGlobalOptions() {
    return this._opts;
  }

  /**
   * Get command metadata (jsonMeta)
   * @returns {Object} Command metadata
   */
  getMetadata() {
    return this._parsed?.command?.jsonMeta || {};
  }

  /**
   * Get the list of tasks to execute
   * @returns {Array} Tasks array
   */
  getTasks() {
    return this._tasks;
  }

  /**
   * Get search result information
   * @returns {Object} Search result with found files, directories, etc.
   */
  getSearchResult() {
    return this._searchResult;
  }

  /**
   * Check if quiet mode is enabled
   * @returns {boolean} True if quiet mode
   */
  isQuiet() {
    return this._opts.quiet;
  }

  /**
   * Check if serial execution is requested
   * @returns {boolean} True if serial execution
   */
  isSerial() {
    return this._opts.serial;
  }

  /**
   * Get stop on error setting
   * @returns {string|boolean} Stop on error setting
   */
  getStopOnError() {
    return this._opts.soe;
  }

  /**
   * Get arguments that came after "--" in the CLI
   * These are stored in parsed._ by nix-clap
   * @returns {Array} Arguments after "--"
   */
  getRemainingArgs() {
    return this._remainingArgs;
  }

  /**
   * Check if there are any remaining arguments after "--"
   * @returns {boolean} True if there are remaining arguments
   */
  hasRemainingArgs() {
    return this._remainingArgs && this._remainingArgs.length > 0;
  }

  /**
   * Get raw command args for backward compatibility
   * @returns {Object} Raw command args object
   */
  getRawCmdArgs() {
    return this._cmdArgs;
  }

  /**
   * Get raw parsed command for backward compatibility
   * @returns {Object} Raw parsed command object
   */
  getRawParsed() {
    return this._parsed;
  }

  /**
   * Get all task names that have command nodes
   * @returns {Array} Array of task names
   */
  getAllTaskNames() {
    return Object.keys(this._subCmdNodes);
  }

  /**
   * Check if a given task is the last task from CLI arguments
   * This is used to determine where to append remaining args
   * @param {string} taskName - Name of the task to check
   * @param {string} taskType - Type of task (e.g., 'shell', 'function')
   * @returns {boolean} True if this is the last CLI task and it's a shell task
   */
  isLastTask(taskName) {
    return this._tasks.at(-1) === taskName;
  }
}

module.exports = { CliContext };

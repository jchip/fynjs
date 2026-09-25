export const MARK_URL_SPEC = "~url-spec~";

export const PACKAGE_FYN_JSON = "package-fyn.json";

/**
 * Save a config file to output dir (node_modules) to remember the
 * config used to do install. Mainly added to remember central store
 * dir because if user run install on an exist node_modules that
 * used central store without specifying the flag again, we still
 * need to run install with central store pointing to the original dir.
 */
export const FYN_INSTALL_CONFIG_FILE = ".fyn.json";

export const FV_DIR = ".f";

export const FYN_LOCK_FILE = "fyn-lock.yaml";

/**
 * Copy of the lock data saved under FV_DIR. It always matches what is installed in
 * node_modules. Install uses it when FYN_LOCK_FILE is missing.
 */
export const FYN_INSTALLED_LOCK_FILE = "lock.yaml";

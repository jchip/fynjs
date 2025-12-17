// @ts-nocheck

import VisualLogger from "visual-logger";

export const FETCH_META = "fetch meta";
export const FETCH_PACKAGE = "fetch package";
export const LONG_WAIT_META = "meta still pending";
export const LOAD_PACKAGE = "load package";
export const LONG_WAIT_PACKAGE = "package pending fetch";
export const INSTALL_PACKAGE = "install package";
export const NETWORK_ERROR = "network error";
export const OPTIONAL_RESOLVER = "optional resolver";
export const spinner = VisualLogger.spinners[1];
"use strict";

const Http = require("http");
const Fs = require("fs");
const Yaml = require("js-yaml");
const Path = require("path");
// chalk 6 is ESM-only; require() of it on node >=22.12 yields the namespace,
// so the callable chalk is on `.default`
const chalk = require("chalk").default;
const Crypto = require("crypto");
const { createRequire } = require("module");
const _ = require("lodash");
const createTgz = require("./create-tgz");

// Use createRequire to handle TypeScript files in vitest context
const requireFromHere = createRequire(__filename);
let CliLogger;
try {
  // Try to require the TypeScript file (vitest will handle the .ts extension)
  const cliLoggerModule = requireFromHere("../../../lib/cli-logger.ts");
  CliLogger = cliLoggerModule.default || cliLoggerModule;
} catch (e) {
  // Fallback to .js if .ts doesn't work
  try {
    const cliLoggerModule = requireFromHere("../../../lib/cli-logger.js");
    CliLogger = cliLoggerModule.default || cliLoggerModule;
  } catch (e2) {
    const cliLoggerModule = requireFromHere("../../../lib/cli-logger");
    CliLogger = cliLoggerModule.default || cliLoggerModule;
  }
}

const TGZ_DIR_NAME = ".tgz";

const CALC_SHASUM = Symbol("calc-shasum");

let metaCache = {};

const DEFAULT_PORT = 4873;
const DEFAULT_PORT_STR = `:${DEFAULT_PORT}`;

let PORT = DEFAULT_PORT;
let PORT_STR = DEFAULT_PORT_STR;

function updateDist(meta) {
  if (meta[CALC_SHASUM]) return;
  meta[CALC_SHASUM] = true;
  _.each(meta.versions, vpkg => {
    const tgzFile = Path.basename(vpkg.dist.tarball);
    const tgzData = Fs.readFileSync(Path.join(__dirname, TGZ_DIR_NAME, tgzFile));
    const sha = Crypto.createHash("sha1");
    sha.update(tgzData);
    vpkg.dist.shasum = sha.digest("hex");
    vpkg.dist.tarball = vpkg.dist.tarball.replace(DEFAULT_PORT_STR, PORT_STR);
  });
}

function readMeta(pkgName) {
  let meta = metaCache[pkgName];

  if (!meta) {
    const metaData = Fs.readFileSync(Path.join(__dirname, "metas", `${pkgName}.yml`));
    meta = Yaml.load(metaData);
    metaCache[pkgName] = meta;
  }
  updateDist(meta);

  return meta;
}

function sendJson(res, code, obj, headers) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    ...headers
  });
  res.end(body);
}

function sendText(res, code, text) {
  const body = Buffer.from(text);
  res.writeHead(code, {
    "content-type": "text/html; charset=utf-8",
    "content-length": body.length
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { statusCode: 404, error: "Not Found", message: "Not Found" });
}

function mockNpm({ port = DEFAULT_PORT, logLevel = "info" }) {
  metaCache = {};
  const logger = new CliLogger();
  logger._logLevel = CliLogger.Levels[logLevel] || CliLogger.Levels.info;

  const packagesDir = Path.join(__dirname, TGZ_DIR_NAME);

  // GET /{pkgName} - package meta
  const getMeta = (req, res, pkgName) => {
    logger.debug(
      chalk.blue("mock npm: ") + new Date().toLocaleString() + ":",
      "retrieving meta",
      pkgName
    );
    let meta;
    try {
      meta = readMeta(pkgName);
    } catch (err) {
      // Package not found in mock registry - return 404
      logger.debug(`mock npm: package ${pkgName} not found`);
      return sendJson(res, 404, {
        error: "not_found",
        reason: `Package '${pkgName}' not found`
      });
    }

    let etag = req.headers["if-none-match"];
    etag = etag && etag.split(`"`)[1];
    if (etag && pkgName !== "always-change") {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }

    return sendJson(res, 200, _.omit(meta, "etag"), {
      ETag: `"${meta.etag}_${Date.now()}"`
    });
  };

  // GET /{pkgName}/-/{tgzFile} - package tarball
  const getTgz = (req, res, pkgName, tgzFile) => {
    if (pkgName.indexOf("-bad-") >= 0) {
      logger.error("mock-npm server: ERROR: trying to fetch tgz of", pkgName);
      return sendText(res, 500, "fetch bad tgz not allowed");
    }
    logger.debug(new Date().toLocaleString() + ":", "fetching", pkgName, tgzFile);
    let pkg;
    try {
      pkg = Fs.readFileSync(Path.join(packagesDir, tgzFile));
    } catch (err) {
      return notFound(res);
    }
    res.writeHead(200, {
      "content-type": "application/x-gzip",
      "content-disposition": "inline",
      "content-length": pkg.length
    });
    return res.end(pkg);
  };

  const server = Http.createServer((req, res) => {
    if (req.method !== "GET") return notFound(res);

    const pathname = new URL(req.url, "http://localhost").pathname;
    const parts = pathname.split("/").filter(x => x);

    if (parts.length === 1) {
      return getMeta(req, res, decodeURIComponent(parts[0]));
    }

    if (parts.length === 3 && parts[1] === "-") {
      return getTgz(req, res, decodeURIComponent(parts[0]), decodeURIComponent(parts[2]));
    }

    return notFound(res);
  });

  // keep-alive sockets would hold close() open, so track them for stop()
  const sockets = new Set();
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  server.info = { port: undefined };
  server.stop = () =>
    new Promise(resolve => {
      server.close(resolve);
      for (const socket of sockets) socket.destroy();
      sockets.clear();
    });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number.isFinite(port) ? port : 0, () => {
      server.removeListener("error", reject);
      PORT = server.address().port;
      PORT_STR = `:${PORT}`;
      server.info.port = PORT;
      resolve(server);
    });
  });
}

module.exports = mockNpm;

if (require.main === module) {
  createTgz().then(() => mockNpm({}));
}

const useBlueBird = process.env.USE_BLUEBIRD === "true";

const AveAzul = useBlueBird ? require("bluebird") : require("../lib/aveazul");

if (!AveAzul.___throwUncaughtError) {
  AveAzul.___throwUncaughtError = () => {};
}

module.exports = AveAzul;

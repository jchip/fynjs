import Bluebird from "bluebird";
import { AveAzul as AveAzulModule } from "../src/index.ts";

const useBlueBird = process.env.USE_BLUEBIRD === "true";

const AveAzul = useBlueBird ? Bluebird : AveAzulModule;

if (!AveAzul.___throwUncaughtError) {
  AveAzul.___throwUncaughtError = () => {};
}

export default AveAzul;

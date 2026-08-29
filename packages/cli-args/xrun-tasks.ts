import { loadTasks } from "@xarc/module-dev";
import xrun from "@fynjs/run";

// @xarc/module-dev registers its `xarc` task namespace on the `@xarc/run` instance it requires by
// name. This repo runs the renamed @fynjs/run - a separate module with its own instance - so the
// namespace would land on a runner that never executes. Pass ours in explicitly.
loadTasks({ xrun });

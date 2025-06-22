import { loadTasks } from "@xarc/module-dev";
loadTasks();
import { load } from "@xarc/run";

load({
  hello() {
    console.log("hello world from pkg1");
  },
});

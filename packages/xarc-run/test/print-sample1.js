import xrun from "../lib/index.js";
import print1 from "./fixtures/print1.js";

xrun.load(print1);
xrun.load("ns1", print1);

xrun.printTasks();

"use strict";

// example showing uses with visual-logger

const Promise = require("bluebird");
const VisualLogger = require("visual-logger");
const logger = new VisualLogger();
const chalk = require("chalk");

const ItemQueue = require(".."); // or require("item-queue")

const TOTAL_ITEMS = Math.floor(Math.random() * 10 + 5);

const makeItem = () => Math.floor(Math.random() * 2000 + Math.random() * 1000 + 100);

let itemCount = 0;
const itemQ = new ItemQueue({
  concurrency: 3, // maximum process 3 concurrent items
  watchPeriod: 100, // watcher check every 100 ms
  watchTime: 1000, // emit watch event if any item takes longer than 1000ms to complete
  stopOnError: true, // stop entire queue if any item process failed
  processItem: item => {
    //
    // A simple delayed counting to simulate some async work and display it
    // with visual logger.
    //
    const start = Date.now();
    let count = 0;
    const name = `item_${item}`;
    logger.addItem({
      name,
      display: `Item ${item}`,
      color: "cyan",
      spinner: VisualLogger.spinners[1]
    });
    const update = () => {
      count++;
      logger.updateItem(name, `${count}`);

      if (Date.now() - start < item) {
        return Promise.delay(100).then(update);
      } else {
        logger.info(`Item ${item} done - count reached ${count}.`);
        logger.removeItem(name);
      }
    };

    return update();
  },
  handlers: {
    done: () => {
      logger.info("done, bye");
    },
    doneItem: () => {
      itemCount++;
    },
    empty: () => {
      if (itemCount < TOTAL_ITEMS) {
        itemQ.addItem(makeItem());
      }
    },
    watch: w => {
      if (w.total > 0) {
        logger.addItem({ name: "watch", display: "Items Pending", color: "yellow" });
        const allPending = w.watched.concat(w.still);
        logger.updateItem(
          "watch",
          allPending.map(x => `${x.item} (${chalk.magenta(x.time)}ms)`).join(" ")
        );
      } else {
        logger.removeItem("watch");
      }
    }
  }
})
  .addItems(Array.apply(null, { length: Math.floor(Math.random() * 5 + 3) }).map(makeItem))
  .start();

itemQ.wait();

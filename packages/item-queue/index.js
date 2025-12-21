"use strict";

/* compatibility bridge for typescript/ESM and commonjs */

const Inflight = require("./lib/inflight");
const ItemQ = require("./lib/item-queue");

class ItemQueue extends ItemQ {}

Object.defineProperties(ItemQueue, {
  ItemQueue: {
    enumerable: false,
    configurable: false,
    value: ItemQ,
  },
  Inflight: {
    enumerable: false,
    configurable: false,
    value: Inflight,
  },
});

module.exports = ItemQueue;

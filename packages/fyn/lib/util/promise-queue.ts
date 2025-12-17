// @ts-nocheck

import ItemQueue from "item-queue";
import Bluebird from "./aveazul";
ItemQueue.Promise = Bluebird;
export default ItemQueue;
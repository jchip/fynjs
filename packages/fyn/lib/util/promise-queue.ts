import { ItemQueue } from "item-queue";
import Bluebird from "./aveazul";
(ItemQueue as any).Promise = Bluebird;
export default ItemQueue;
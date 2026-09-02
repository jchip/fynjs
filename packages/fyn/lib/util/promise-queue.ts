import { ItemQueue } from "item-queue";
import AveAzul from "./aveazul";
(ItemQueue as any).Promise = AveAzul;
export default ItemQueue;

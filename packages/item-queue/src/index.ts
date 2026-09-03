//
// item-queue's `Inflight` was a byte-for-byte twin of xflight's keyed store, so it now comes
// from there (FJM-26). xflight's `Inflight` adds promise deduplication on top of the same
// core; what item-queue wants is the core itself, since it tracks `{ item, promise }` records
// keyed by number. Re-exported under the historical names so consumers are unaffected.
//
export { InflightStore as Inflight } from "xflight";
export type { InflightItem as InflightRecord, RecordKey } from "xflight";

export { ItemQueue } from "./item-queue.js";
export type {
  ItemQueueData,
  WatchItemInfo,
  WatchData,
  ItemQueueResult,
  ItemQueueHandler,
  ItemQueueHandlers,
  ProcessCb,
  ItemQueueOptions
} from "./item-queue.js";

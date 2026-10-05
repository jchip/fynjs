import { describe, it, expect } from "vitest";
import { postJob } from "../../../lib/util/fs-worker-pool";

const capture = () => {
  const sent: { msg: any; transfer?: readonly unknown[] }[] = [];
  return { sent, worker: { postMessage: (msg: any, transfer?: readonly unknown[]) => sent.push({ msg, transfer }) } };
};

describe("fs-worker-pool postJob", () => {
  it("sends a job without data as is", () => {
    const { sent, worker } = capture();
    postJob(worker as any, 1, { op: "scan", job: { dir: "/d" } });
    expect(sent).toEqual([{ msg: { id: 1, op: "scan", job: { dir: "/d" } }, transfer: undefined }]);
  });

  it("transfers a copy of just the data's view, and leaves the caller's Buffer alone", () => {
    const { sent, worker } = capture();
    const big = Buffer.alloc(64 * 1024, 7);
    const data = big.subarray(100, 110);
    postJob(worker as any, 2, { op: "store", job: { data, integrity: "i", contentPath: "/c" } });
    const [{ msg, transfer }] = sent;
    expect(msg.job.data).not.toBe(data);
    expect(msg.job.data.buffer.byteLength).toBe(10);
    expect(Array.from(msg.job.data)).toEqual(Array.from(data));
    expect(transfer).toEqual([msg.job.data.buffer]);
    expect(msg.job).toMatchObject({ integrity: "i", contentPath: "/c" });
    expect(data.byteLength).toBe(10);
  });
});

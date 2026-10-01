import { describe, expect, it } from "vitest";
import {
  CATEGORY_ADMIN_WORKER_BATCH_SIZE,
  HEAVY_ADMIN_WORKER_BATCH_SIZE,
  splitIntoWorkerBatches,
} from "@/lib/admin/worker-batching";

describe("splitIntoWorkerBatches", () => {
  it("keeps heavy admin mutations below the Cloudflare Worker subrequest ceiling", () => {
    const ids = Array.from({ length: 11 }, (_, index) => `book-${index + 1}`);
    const batches = splitIntoWorkerBatches(ids, HEAVY_ADMIN_WORKER_BATCH_SIZE);
    expect(batches.map((batch) => batch.length)).toEqual([3, 3, 3, 2]);
    expect(batches.flat()).toEqual(ids);
  });

  it("uses a larger but still bounded batch for category updates", () => {
    expect(CATEGORY_ADMIN_WORKER_BATCH_SIZE).toBe(10);
    expect(splitIntoWorkerBatches([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("rejects invalid batch sizes", () => {
    expect(() => splitIntoWorkerBatches([1], 0)).toThrow(/positive integer/i);
  });
});

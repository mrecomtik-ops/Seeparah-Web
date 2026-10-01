export const HEAVY_ADMIN_WORKER_BATCH_SIZE = 3;
export const CATEGORY_ADMIN_WORKER_BATCH_SIZE = 10;

export function splitIntoWorkerBatches<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("Worker batch size must be a positive integer");
  }
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export type SampleBatch = {
  imported: number;
  skipped: number;
  next: number;
  total: number;
};

// Small requests give visible progress and stop at the first error. A user-led
// restart visits earlier ranges again; the server skips completed records.
export async function importSampleBatches(
  request: (range: { offset: number; limit: number }) => Promise<SampleBatch>,
  progress: (completed: number, total: number) => void,
) {
  const total = 40;
  let offset = 0,
    imported = 0,
    skipped = 0;
  progress(offset, total);
  do {
    const batch = await request({ offset, limit: 4 });
    if (
      !Number.isInteger(batch.next) ||
      !Number.isInteger(batch.total) ||
      batch.total !== total ||
      batch.next <= offset ||
      batch.next > Math.min(offset + 4, total)
    )
      throw new Error('Invalid sample import progress');
    offset = batch.next;
    imported += batch.imported;
    skipped += batch.skipped;
    progress(offset, total);
  } while (offset < total);
  return { imported, skipped };
}

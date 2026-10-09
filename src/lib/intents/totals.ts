import { getDb } from '@/lib/db/db';
import type { FileItem, ReceiptTotal } from '@/features/search/types';
import { rowToItem, type FileRow } from '@/lib/db/files';

// Receipt math is always code: SQL picks the rows, JS sums them. The LLM is
// never involved in the number.
export async function receiptTotal(opts: {
  dateFrom?: number;
  dateTo?: number;
  merchant?: string;
}): Promise<{ total: ReceiptTotal; items: FileItem[] }> {
  const db = await getDb();

  let rows: (FileRow & { value_num: number })[];
  if (opts.merchant) {
    rows = await db.getAllAsync<FileRow & { value_num: number }>(
      `SELECT f.*, t.value_num FROM facts t
       JOIN files f ON f.id = t.file_id
       JOIN facts m ON m.file_id = f.id AND m.kind = 'merchant' AND m.value_text = ?
       WHERE t.kind = 'total'`,
      [opts.merchant],
    );
  } else {
    rows = await db.getAllAsync<FileRow & { value_num: number }>(
      `SELECT f.*, t.value_num FROM facts t JOIN files f ON f.id = t.file_id WHERE t.kind = 'total'`,
    );
  }

  const when = (r: FileRow) => r.taken_at ?? r.modified_at;
  const inRange = rows.filter(
    (r) => (opts.dateFrom === undefined || when(r) >= opts.dateFrom) && (opts.dateTo === undefined || when(r) < opts.dateTo),
  );
  inRange.sort((a, b) => when(b) - when(a));

  const amount = inRange.reduce((sum, r) => sum + r.value_num, 0);
  return {
    total: {
      amount,
      currency: 'PHP',
      count: inRange.length,
      merchant: opts.merchant,
      fileIds: inRange.map((r) => String(r.id)),
    },
    items: inRange.map((r) => rowToItem(r)),
  };
}

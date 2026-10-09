import type { FileItem, FilePlan, PlanOp, PlanResult } from '@/features/search/types';
import { getDb } from '@/lib/db/db';
import { rowToItem, type FileRow } from '@/lib/db/files';
import { sanitizeDestination } from '@/lib/intents/destination';
import { native } from '@/lib/native';
import type { FileOp, FileOpResult } from '@/lib/native/contract';
import { relativeFolderOf } from '@/lib/scan-paths';
import { PRIVATE_FOLDER } from '@/lib/search/vocab';

let counter = 0;
const nextOpId = () => `op-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function buildMovePlan(files: FileItem[], destination: string): FilePlan {
  // Destinations are folder names relative to the storage root ("Documents/Receipts"); the native side resolves them.
  const dest = sanitizeDestination(destination);
  const ops: PlanOp[] = files.map((f) => ({
    id: nextOpId(),
    fileId: f.id,
    from: f.path,
    to: `${dest}/${f.name}`,
    checked: true,
  }));
  return { ops, destination: dest, state: 'pending' };
}

export function planOps(plan: FilePlan): FileOp[] {
  const ops: FileOp[] = [{ op: 'mkdir', to: plan.destination }];
  for (const o of plan.ops.filter((o) => o.checked)) {
    ops.push({ op: 'move', from: o.from, to: o.to });
  }
  return ops;
}

// Reverse of a successful move/copy result, for Undo. Copies have no reverse
// (nothing is deleted in this build), so only moves/renames come back.
export function reverseOps(results: FileOpResult[]): FileOp[] {
  const out: FileOp[] = [];
  for (const r of results) {
    if (!r.ok || !r.finalPath) continue;
    if ((r.op.op === 'move' || r.op.op === 'rename') && r.op.from) {
      out.push({ op: 'move', from: r.finalPath, to: r.op.from });
    }
  }
  return out.reverse();
}

/** What really happened, for the card: how many files moved, how many did not, and the first reason. */
export function summarizeResults(results: FileOpResult[]): PlanResult {
  const transfers = results.filter((r) => r.op.op !== 'mkdir');
  const moved = transfers.filter((r) => r.ok).length;
  return {
    moved,
    failed: transfers.length - moved,
    firstError: results.find((r) => !r.ok)?.error,
  };
}

function folderFor(finalPath: string): string {
  return '/' + relativeFolderOf(finalPath);
}

async function recordMove(from: string, finalPath: string) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE files SET path = ?, folder = ?, uri = CASE WHEN uri LIKE 'file://%' THEN ? ELSE uri END WHERE path = ?`,
    [finalPath, folderFor(finalPath), 'file://' + finalPath, from],
  );
}

export async function runPlan(plan: FilePlan, batchId: string): Promise<FileOpResult[]> {
  const db = await getDb();
  const ops = planOps(plan);
  const results = await native.runFileOps(batchId, ops);
  const now = Date.now();
  for (const r of results) {
    await db.runAsync(
      'INSERT INTO actions_log (batch_id, action, status, from_path, to_path, created_at) VALUES (?,?,?,?,?,?)',
      [batchId, r.op.op, r.ok ? 'done' : 'error', r.op.from ?? null, r.finalPath ?? r.op.to, now],
    );
    if (r.ok && r.finalPath && r.op.from && (r.op.op === 'move' || r.op.op === 'rename')) {
      await recordMove(r.op.from, r.finalPath);
    }
  }
  return results;
}

export async function undoBatch(batchId: string, results: FileOpResult[]): Promise<FileOpResult[]> {
  const db = await getDb();
  const undo = await native.runFileOps(`${batchId}-undo`, reverseOps(results));
  for (const r of undo) {
    if (r.ok && r.finalPath && r.op.from) await recordMove(r.op.from, r.finalPath);
  }
  await db.runAsync('UPDATE actions_log SET undone = 1 WHERE batch_id = ?', [batchId]);
  return undo;
}

export async function sensitiveFiles(): Promise<FileItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FileRow>('SELECT * FROM files WHERE is_sensitive = 1 ORDER BY modified_at DESC');
  return rows.map((r) => rowToItem(r));
}

export { PRIVATE_FOLDER };

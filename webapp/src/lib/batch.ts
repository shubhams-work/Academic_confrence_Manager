import type { BulkCreateMembersResult } from './api';

/** Split rows into stable-sized batches; an empty input produces no batches. */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error('Chunk size must be a positive integer.');
  const parts: T[][] = [];
  for (let i = 0; i < arr.length; i += size) parts.push(arr.slice(i, i + size));
  return parts;
}

/** Combine per-request counts and row outcomes without losing server order. */
export function mergeBulkResults(parts: BulkCreateMembersResult[]): BulkCreateMembersResult {
  return parts.reduce<BulkCreateMembersResult>(
    (result, part) => ({
      invited: result.invited + part.invited,
      skipped: result.skipped + part.skipped,
      errors: result.errors + part.errors,
      invites: [...result.invites, ...part.invites],
    }),
    { invited: 0, skipped: 0, errors: 0, invites: [] },
  );
}

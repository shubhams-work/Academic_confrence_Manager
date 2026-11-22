import { describe, expect, it } from 'vitest';
import { chunk, mergeBulkResults } from './batch';

describe('chunk', () => {
  it('returns no chunks for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('splits exact multiples into equal chunks', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('keeps the remainder in a final shorter chunk', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('mergeBulkResults', () => {
  it('merges totals and preserves invite order', () => {
    const first = {
      invited: 2,
      skipped: 1,
      errors: 0,
      invites: [{ email: 'a@example.com', name: 'A', status: 'invited' as const }],
    };
    const second = {
      invited: 0,
      skipped: 1,
      errors: 1,
      invites: [
        { email: 'b@example.com', name: 'B', status: 'exists' as const },
        { email: 'c@example.com', name: 'C', status: 'error' as const },
      ],
    };
    expect(mergeBulkResults([first, second])).toEqual({
      invited: 2,
      skipped: 2,
      errors: 1,
      invites: [...first.invites, ...second.invites],
    });
  });
});

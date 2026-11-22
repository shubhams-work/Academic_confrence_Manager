// Pure scoring rules. The database view `paper_scores` implements the same
// rules in SQL; these functions mirror them for the UI and unit tests.
// Port of ../lib/core/scoring.dart — keep in sync.

export function roundTo(v: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(v * f) / f;
}

/**
 * Average of the submitted panel-member totals (each out of 50).
 * Returns null when nobody has submitted yet.
 */
export function presentationScore(submittedTotals: Iterable<number>): number | null {
  const list = [...submittedTotals];
  if (list.length === 0) return null;
  const avg = list.reduce((a, b) => a + b, 0) / list.length;
  return roundTo(avg, 2);
}

/** Presentation (/50) + Review (/50) = Final (/100). Missing parts count as 0. */
export function finalScore(presentation: number | null, review: number | null): number {
  return roundTo((presentation ?? 0) + (review ?? 0), 2);
}

/** The three numbers that decide a paper's rank within its track. */
export interface RankableScore {
  finalScore: number;
  reviewScore: number | null;
  presentationScore: number | null;
}

/** Same ordering as the `paper_scores` view: final, review, presentation; nulls last. */
function compareRankable(a: RankableScore, b: RankableScore): number {
  if (a.finalScore !== b.finalScore) return b.finalScore - a.finalScore;

  if (a.reviewScore !== b.reviewScore) {
    if (a.reviewScore == null) return 1;
    if (b.reviewScore == null) return -1;
    return b.reviewScore - a.reviewScore;
  }

  if (a.presentationScore !== b.presentationScore) {
    if (a.presentationScore == null) return 1;
    if (b.presentationScore == null) return -1;
    return b.presentationScore - a.presentationScore;
  }

  return 0;
}

/**
 * Dense rank using the `paper_scores` key: final (/100), then review (/50),
 * then presentation (/50). Nulls sort below real values, so a missing review
 * ranks below a review of 0. Papers equal on all three share a rank.
 * Returns ranks in the same order as the input.
 */
export function denseRankRows(rows: readonly RankableScore[]): number[] {
  const ordered = rows.map((row, index) => ({ row, index }));
  ordered.sort((a, b) => compareRankable(a.row, b.row));

  const ranks = new Array<number>(rows.length);
  let rank = 0;
  let previous: RankableScore | null = null;
  for (const { row, index } of ordered) {
    if (previous == null || compareRankable(previous, row) !== 0) rank += 1;
    ranks[index] = rank;
    previous = row;
  }
  return ranks;
}

/** Dense rank on final score alone: [80, 75, 75, 60] -> [1, 2, 2, 3]. */
export function denseRank(scores: number[]): number[] {
  return denseRankRows(
    scores.map((finalScore) => ({ finalScore, reviewScore: null, presentationScore: null })),
  );
}

/** Formats 40 as "40" and 40.5 as "40.5". */
export function fmtScore(v: number | null): string {
  if (v == null) return '—';
  if (v === Math.round(v)) return String(Math.round(v));
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

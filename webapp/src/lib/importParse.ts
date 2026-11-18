// Validation of spreadsheet rows for the two Chair uploads.
// Works on plain string rows so it can be unit-tested without Excel files.
// Port of ../lib/core/import/paper_import.dart — keep messages and aliases in sync.

/** 1-based spreadsheet row number (header is row 1). */
export class ImportIssue {
  constructor(
    readonly row: number,
    readonly message: string,
  ) {}

  toString(): string {
    return `Row ${this.row}: ${this.message}`;
  }
}

export interface AuthorDraftJson {
  name: string;
  affiliation: string;
  email: string;
  phone: string;
}

export class AuthorDraft {
  constructor(
    readonly name: string,
    readonly affiliation = '',
    readonly email = '',
    readonly phone = '',
  ) {}

  toJson(): AuthorDraftJson {
    return { name: this.name, affiliation: this.affiliation, email: this.email, phone: this.phone };
  }
}

export interface PaperDraftJson {
  pid: string;
  title: string;
  track: string;
  review_score: number | null;
  authors?: AuthorDraftJson[];
}

export class PaperDraft {
  readonly authors: AuthorDraft[] = [];
  /** Spreadsheet rows (1-based) this paper was built from. */
  readonly rows: number[] = [];
  reviewScore: number | null;

  constructor(
    readonly pid: string,
    readonly title: string,
    readonly track: string,
    reviewScore: number | null = null,
  ) {
    this.reviewScore = reviewScore;
  }

  toJson(): PaperDraftJson {
    return {
      pid: this.pid,
      title: this.title,
      track: this.track,
      review_score: this.reviewScore,
      authors: this.authors.map((a) => a.toJson()),
    };
  }
}

/** Papers with no errors — these will be imported. */
export class PaperImportResult {
  constructor(
    readonly papers: PaperDraft[],
    readonly issues: ImportIssue[],
    /** Paper IDs that had at least one error and will be skipped. */
    readonly skippedPids: Set<string>,
  ) {}

  get authorCount(): number {
    return this.papers.reduce((n, p) => n + p.authors.length, 0);
  }
}

export interface ReviewScoreDraftJson {
  pid: string;
  review_score: number;
}

export class ReviewScoreDraft {
  constructor(
    readonly pid: string,
    readonly score: number,
    readonly row: number,
  ) {}

  toJson(): ReviewScoreDraftJson {
    return { pid: this.pid, review_score: this.score };
  }
}

export class ReviewImportResult {
  constructor(
    readonly scores: ReviewScoreDraft[],
    readonly issues: ImportIssue[],
  ) {}
}

// ---------------------------------------------------------------------------

const pidHeaders = new Set(['paperid', 'pid', 'id', 'paperno', 'papernumber', 'paper']);
const titleHeaders = new Set(['title', 'papertitle']);
const trackHeaders = new Set(['track', 'trackname']);
const authorHeaders = new Set(['authorname', 'author', 'name', 'authorsname']);
const affiliationHeaders = new Set([
  'affiliation',
  'companycollege',
  'collegecompany',
  'college',
  'company',
  'institution',
  'institute',
  'organisation',
  'organization',
]);
const emailHeaders = new Set(['email', 'emailid', 'authoremail', 'mail', 'emailaddress']);
const phoneHeaders = new Set(['phone', 'contact', 'mobile', 'phoneno', 'contactno', 'phonenumber', 'mobileno']);
const reviewHeaders = new Set(['reviewscore', 'review', 'reviewerscore', 'reviewscore50', 'reviewmarks', 'score']);

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Cleans a cell value: trims, and turns numeric artifacts like "101.0" into "101". */
export function cleanCell(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  if (/^-?\d+\.0+$/.test(s)) return s.substring(0, s.indexOf('.'));
  return s;
}

function find(headers: string[], names: Set<string>): number | null {
  for (let i = 0; i < headers.length; i++) {
    if (names.has(norm(headers[i] ?? ''))) return i;
  }
  return null;
}

function at(row: string[], i: number | null): string {
  return i == null || i >= row.length ? '' : cleanCell(row[i]);
}

/** Parses a review score 0–50. Returns [value, error]. */
export function parseReviewScore(raw: string): [number | null, string | null] {
  if (raw === '') return [null, null];
  const v = Number(raw);
  if (Number.isNaN(v)) return [null, `Review score "${raw}" is not a number`];
  if (v < 0 || v > 50) return [null, `Review score ${raw} must be between 0 and 50`];
  return [Math.round(v * 10) / 10, null];
}

/** Matches a track name case/space-insensitively. Returns the canonical name or null. */
export function matchTrack(raw: string, trackNames: Iterable<string>): string | null {
  const n = norm(raw);
  for (const t of trackNames) {
    if (norm(t) === n) return t;
  }
  return null;
}

/**
 * rows[0] is the header row. Rows sharing a Paper ID are grouped into one paper
 * (one row per author).
 */
export function parsePapers(rows: string[][], trackNames: Iterable<string>): PaperImportResult {
  const issues: ImportIssue[] = [];
  const tracks = [...trackNames];
  if (rows.length === 0) {
    return new PaperImportResult([], [new ImportIssue(1, 'The sheet is empty')], new Set());
  }
  const h = rows[0]!;
  const iPid = find(h, pidHeaders);
  const iTitle = find(h, titleHeaders);
  const iTrack = find(h, trackHeaders);
  const iAuthor = find(h, authorHeaders);
  const iAff = find(h, affiliationHeaders);
  const iEmail = find(h, emailHeaders);
  const iPhone = find(h, phoneHeaders);
  const iReview = find(h, reviewHeaders);

  const missing: string[] = [];
  if (iPid == null) missing.push('Paper ID');
  if (iTitle == null) missing.push('Title');
  if (iTrack == null) missing.push('Track');
  if (missing.length > 0) {
    return new PaperImportResult([], [new ImportIssue(1, `Missing column(s): ${missing.join(', ')}`)], new Set());
  }

  const byPid = new Map<string, PaperDraft>();
  const bad = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const rowNo = r + 1;
    if (row.every((c) => cleanCell(c) === '')) continue;

    const pid = at(row, iPid);
    const title = at(row, iTitle);
    const trackRaw = at(row, iTrack);
    if (pid === '') {
      issues.push(new ImportIssue(rowNo, 'Paper ID is missing'));
      continue;
    }

    let rowOk = true;
    const err = (m: string): void => {
      issues.push(new ImportIssue(rowNo, `${pid}: ${m}`));
      rowOk = false;
    };

    const track = matchTrack(trackRaw, tracks);
    if (trackRaw === '') {
      err('Track is missing');
    } else if (track == null) {
      err(`Unknown track "${trackRaw}" (must be one of: ${tracks.join(', ')})`);
    }
    const [review, reviewErr] = parseReviewScore(at(row, iReview));
    if (reviewErr != null) err(reviewErr);

    const email = at(row, iEmail).toLowerCase();
    if (email !== '' && !emailRe.test(email)) err(`Email "${email}" is not valid`);

    let paper = byPid.get(pid);
    if (paper == null) {
      if (title === '') err('Title is missing');
      paper = new PaperDraft(pid, title, track ?? trackRaw, review);
      byPid.set(pid, paper);
    } else {
      if (title !== '' && title !== paper.title) err('Title differs from an earlier row with the same Paper ID');
      if (track != null && track !== paper.track) err('Track differs from an earlier row with the same Paper ID');
      if (review != null) {
        if (paper.reviewScore != null && paper.reviewScore !== review) {
          err('Review score differs from an earlier row with the same Paper ID');
        }
        paper.reviewScore ??= review;
      }
    }
    paper.rows.push(rowNo);

    const authorName = at(row, iAuthor);
    if (authorName !== '') {
      paper.authors.push(
        new AuthorDraft(authorName, at(row, iAff), email, at(row, iPhone)),
      );
    }
    if (!rowOk) bad.add(pid);
  }

  const papers = [...byPid.values()].filter((p) => !bad.has(p.pid));
  return new PaperImportResult(papers, issues, bad);
}

/** rows[0] is the header row: Paper ID, Review Score. */
export function parseReviewScores(rows: string[][]): ReviewImportResult {
  const issues: ImportIssue[] = [];
  if (rows.length === 0) return new ReviewImportResult([], [new ImportIssue(1, 'The sheet is empty')]);
  const h = rows[0]!;
  const iPid = find(h, pidHeaders);
  const iReview = find(h, reviewHeaders);
  if (iPid == null || iReview == null) {
    const missing: string[] = [];
    if (iPid == null) missing.push('Paper ID');
    if (iReview == null) missing.push('Review Score');
    return new ReviewImportResult([], [new ImportIssue(1, `Missing column(s): ${missing.join(', ')}`)]);
  }

  const seen = new Map<string, ReviewScoreDraft>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const rowNo = r + 1;
    if (row.every((c) => cleanCell(c) === '')) continue;
    const pid = at(row, iPid);
    const raw = at(row, iReview);
    if (pid === '') {
      // Row with no Paper ID — if the Review Score is also blank, silently skip
      // (pre-filled-template rows the Chair chose not to fill).
      if (raw === '') continue;
      issues.push(new ImportIssue(rowNo, 'Paper ID is missing'));
      continue;
    }
    if (raw === '') {
      // Paper is in the sheet but no score yet; skip without flagging — the
      // pre-filled review-scores template leaves this blank for every unmarked
      // paper, and the Chair can re-upload later with the remaining scores.
      continue;
    }
    const [score, e] = parseReviewScore(raw);
    if (e != null) {
      issues.push(new ImportIssue(rowNo, `${pid}: ${e}`));
      continue;
    }
    const prev = seen.get(pid);
    if (prev != null && prev.score !== score) {
      issues.push(new ImportIssue(rowNo, `${pid}: appears again with a different score (row ${prev.row})`));
      continue;
    }
    seen.set(pid, new ReviewScoreDraft(pid, score!, rowNo));
  }
  return new ReviewImportResult([...seen.values()], issues);
}

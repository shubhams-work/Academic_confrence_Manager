// Dynamic-import wrappers around read-excel-file / write-excel-file.
// Both libraries are only downloaded when the Chair actually imports or
// exports spreadsheets — keep them out of static imports everywhere.
// Port of ../lib/core/import/excel_io.dart.

import type { Paper, ScoreRow, Track } from './types';

/** One sheet of a workbook: name plus rows including the header row. */
export interface WorkbookSheet {
  name: string;
  rows: (string | number | boolean | Date | null)[][];
}

/** A cell as read from a spreadsheet, normalised to a string. */
function cellText(v: string | number | boolean | Date | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number') {
    return v === Math.round(v) && Math.abs(v) < 1e15 ? String(Math.round(v)) : String(v);
  }
  return String(v);
}

/**
 * Reads the first non-empty sheet of an .xlsx file as rows of strings.
 * Leading blank rows are dropped so the first returned row is the header.
 */
export async function readSheetRows(file: File): Promise<string[][]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile(file);
  for (const { data } of sheets) {
    const rows = data.map((row) => row.map((c) => cellText(c as string | number | boolean | Date | null)));
    while (rows.length > 0 && (rows[0]?.every((c) => c.trim() === '') ?? true)) rows.shift();
    if (rows.length > 0) return rows;
  }
  return [];
}

/** Builds and downloads a workbook with one sheet per entry. */
export async function downloadWorkbook(fileName: string, sheets: WorkbookSheet[]): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(
    sheets.map((s) => ({ sheet: safeSheetName(s.name), data: s.rows })),
  ).toFile(fileName);
}

function safeSheetName(s: string): string {
  const cleaned = s.replace(/[\[\]:*?/\\]/g, ' ').trim();
  return cleaned.length > 31 ? cleaned.substring(0, 31) : cleaned;
}

/** "Papers & authors" upload template. */
export function papersTemplate(): Promise<void> {
  return downloadWorkbook('papers-template.xlsx', [
    {
      name: 'Papers',
      rows: [
        ['Paper ID', 'Title', 'Track', 'Author Name', 'Affiliation', 'Email', 'Phone', 'Review Score'],
        ['P101', 'Low-power FinFET SRAM design', 'Semiconductor', 'A. Sharma', 'Sahyadri College', 'a.sharma@example.com', '9876543210', 38],
        ['P101', 'Low-power FinFET SRAM design', 'Semiconductor', 'B. Rao', 'NITK Surathkal', 'b.rao@example.com', '9876500000', null],
        ['P102', 'Edge AI for crop disease detection', 'Intelligent Systems', 'C. Shetty', 'Infosys', 'c.shetty@example.com', '9000000000', 42],
      ],
    },
  ]);
}

/**
 * "Review scores" upload template.
 * With `papers`, each paper gets its own row pre-filled with PID, Title and
 * Track so the Chair only needs to fill the Review Score column.
 */
export function reviewScoresTemplate(
  papers?: { pid: string; title: string; trackName: string; reviewScore: number | null }[],
  trackLookup?: Map<number, string>,
): Promise<void> {
  const header = ['Paper ID', 'Title', 'Track', 'Review Score'];
  if (papers != null && papers.length > 0) {
    const rows: (string | number | null)[][] = [header];
    const sorted = [...papers].sort((a, b) =>
      a.pid.localeCompare(b.pid, undefined, { numeric: true }),
    );
    for (const p of sorted) rows.push([p.pid, p.title, p.trackName, p.reviewScore]);
    return downloadWorkbook('review-scores-template.xlsx', [{ name: 'Review Scores', rows }]);
  }
  // Fallback: static sample when no paper list is available.
  return downloadWorkbook('review-scores-template.xlsx', [
    {
      name: 'Review Scores',
      rows: [
        header,
        ['P101', 'Low-power FinFET SRAM design', 'Semiconductor', 38],
        ['P102', 'Edge AI for crop disease detection', 'Intelligent Systems', 42.5],
      ],
    },
  ]);
  void (trackLookup); // reserved for future use
}

export function reviewScoresTemplateFromPapers(
  papers: Paper[],
  tracks: Track[],
): Promise<void> {
  const byId = new Map(tracks.map((t) => [t.id, t.name] as const));
  return reviewScoresTemplate(
    papers.map((p) => ({
      pid: p.pid,
      title: p.title,
      trackName: byId.get(p.trackId) ?? '',
      reviewScore: p.reviewScore,
    })),
  );
}

/** Panel-members upload template (for the Incharge bulk-create flow). */
export function membersTemplate(): Promise<void> {
  return downloadWorkbook('panel-members-template.xlsx', [
    {
      name: 'Panel Members',
      rows: [
        ['Name', 'Email', 'Phone', 'Affiliation'],
        ['Dr. A. Sharma', 'a.sharma@sahyadri.edu.in', '9845000001', 'Sahyadri College'],
        ['Dr. B. Rao', 'b.rao@nitk.ac.in', '9845000002', 'NITK Surathkal'],
      ],
    },
  ]);
}

/** Credentials export after a successful bulk-create. */
export function credentialsWorkbook(
  rows: { email: string; password: string; name: string; status: string }[],
): Promise<void> {
  return downloadWorkbook('panel-member-credentials.xlsx', [
    {
      name: 'Credentials',
      rows: [
        ['Name', 'Email', 'Password', 'Status'],
        ...rows.map((r) => [r.name, r.email, r.password, r.status]),
      ],
    },
  ]);
}

/** Track-wise results workbook: one sheet per track. */
export function resultsWorkbook(tracks: Track[], rowsByTrack: Map<number, ScoreRow[]>): Promise<void> {
  const header = [
    'Rank',
    'Paper ID',
    'Title',
    'Panel',
    'Presentation (/50)',
    'Review (/50)',
    'Final (/100)',
    'Panel scores submitted',
  ];
  const sheets: WorkbookSheet[] = [];
  for (const t of tracks) {
    const rows = rowsByTrack.get(t.id);
    if (rows == null) continue;
    sheets.push({
      name: t.name,
      rows: [
        header,
        ...rows.map((r) => [
          r.rank,
          r.pid,
          r.title,
          r.panelName ?? '',
          r.presentationScore,
          r.reviewScore,
          r.finalScore,
          `${r.submittedCount}/${r.memberCount}`,
        ]),
      ],
    });
  }
  if (sheets.length === 0) sheets.push({ name: 'Results', rows: [header] });
  return downloadWorkbook('results.xlsx', sheets);
}

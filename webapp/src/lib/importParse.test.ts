// Port of ../test/paper_import_test.dart (xlsx round-trip skipped; pure parsing only).

import { describe, expect, it } from 'vitest';
import { parsePapers, parseReviewScores } from './importParse';

const tracks = ['Computing', 'Semiconductor', 'Mechatronics', 'Intelligent Systems', 'Communications'];

const header = ['Paper ID', 'Title', 'Track', 'Author Name', 'Affiliation', 'Email', 'Phone', 'Review Score'];

describe('parsePapers', () => {
  it('groups rows by Paper ID into one paper with several authors', () => {
    const res = parsePapers(
      [
        header,
        ['P1', 'Paper one', 'Computing', 'A', 'Sahyadri', 'a@x.com', '98765', '38'],
        ['P1', 'Paper one', 'Computing', 'B', 'NITK', 'b@x.com', '', ''],
        ['P2', 'Paper two', 'intelligent systems', 'C', 'Infosys', 'C@X.com', '', '42.5'],
      ],
      tracks,
    );

    expect(res.issues).toEqual([]);
    expect(res.papers).toHaveLength(2);
    const p1 = res.papers[0]!;
    expect(p1.pid).toBe('P1');
    expect(p1.authors.map((a) => a.name)).toEqual(['A', 'B']);
    expect(p1.reviewScore).toBe(38);
    const p2 = res.papers[1]!;
    expect(p2.track).toBe('Intelligent Systems'); // track names match case-insensitively
    expect(p2.authors[0]!.email).toBe('c@x.com');
    expect(p2.reviewScore).toBe(42.5);
  });

  it('flags bad rows and skips those papers', () => {
    const res = parsePapers(
      [
        header,
        ['P1', 'Ok paper', 'Computing', 'A', '', '', '', ''],
        ['P2', 'Bad track', 'Robotics', 'B', '', '', '', ''],
        ['P3', 'Bad score', 'Computing', 'C', '', '', '', '55'],
        ['', 'No id', 'Computing', 'D', '', '', '', ''],
        ['P4', 'Bad email', 'Computing', 'E', '', 'not-an-email', '', ''],
        ['P1', 'Different title', 'Computing', 'F', '', '', '', ''],
      ],
      tracks,
    );

    // P1 is skipped too: a later row gives it a different title.
    expect(res.papers).toEqual([]);
    expect([...res.skippedPids]).toEqual(expect.arrayContaining(['P1', 'P2', 'P3', 'P4']));
    expect(res.issues.map((i) => i.row)).toEqual(expect.arrayContaining([3, 4, 5, 6, 7]));
    expect(res.issues.find((i) => i.row === 4)!.message).toContain('between 0 and 50');
  });

  it('reports missing required columns', () => {
    const res = parsePapers(
      [
        ['Paper ID', 'Author'],
        ['P1', 'A'],
      ],
      tracks,
    );
    expect(res.papers).toEqual([]);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]!.message).toContain('Title');
    expect(res.issues[0]!.message).toContain('Track');
  });

  it('accepts header aliases and numeric-looking ids', () => {
    const res = parsePapers(
      [
        ['PID', 'Paper Title', 'Track', 'Author', 'Company/College', 'Email ID', 'Contact', 'Review'],
        ['101.0', 'T', 'Mechatronics', 'A', 'X Corp', 'a@x.com', '9876543210.0', '40'],
      ],
      tracks,
    );
    expect(res.issues).toEqual([]);
    expect(res.papers).toHaveLength(1);
    expect(res.papers[0]!.pid).toBe('101');
    expect(res.papers[0]!.authors[0]!.affiliation).toBe('X Corp');
    expect(res.papers[0]!.authors[0]!.phone).toBe('9876543210');
  });
});

describe('parseReviewScores', () => {
  it('parses valid rows and flags invalid ones', () => {
    const res = parseReviewScores([
      ['Paper ID', 'Review Score'],
      ['P1', '38'],
      ['P2', '50.0'],
      ['P3', '-1'],
      ['P4', 'abc'],
      ['', '20'],
      ['P1', '30'],
      ['P5', ''],
    ]);
    expect(res.scores.map((s) => [s.pid, s.score])).toEqual([
      ['P1', 38],
      ['P2', 50],
    ]);
    // P5 has no score: silently skipped (matches the pre-filled-template flow).
    expect(res.issues).toHaveLength(4);
  });

  it('silently skips pre-filled rows with no score', () => {
    const res = parseReviewScores([
      ['Paper ID', 'Title', 'Track', 'Review Score'],
      ['P1', 'Alpha', 'Computing', '38'],
      ['P2', 'Beta', 'Computing', ''],
      ['P3', 'Gamma', 'Computing', '42.5'],
      ['', '', '', ''],
    ]);
    expect(res.scores.map((s) => [s.pid, s.score])).toEqual([
      ['P1', 38],
      ['P3', 42.5],
    ]);
    expect(res.issues).toHaveLength(0);
  });
});

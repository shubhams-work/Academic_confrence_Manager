// Port of ../test/scoring_test.dart — keep the same expectations.

import { describe, expect, it } from 'vitest';
import { denseRank, denseRankRows, finalScore, fmtScore, presentationScore } from './scoring';

describe('presentationScore', () => {
  it('averages submitted member totals', () => {
    expect(presentationScore([42, 38])).toBe(40);
    expect(presentationScore([41, 38])).toBe(39.5);
  });

  it('one of two submitted uses that score', () => {
    expect(presentationScore([44])).toBe(44);
  });

  it('nobody submitted -> null', () => {
    expect(presentationScore([])).toBeNull();
  });
});

describe('finalScore', () => {
  it('presentation + review out of 100', () => {
    expect(finalScore(40, 35)).toBe(75);
    expect(finalScore(39.5, 42.5)).toBe(82);
  });

  it('missing parts count as 0', () => {
    expect(finalScore(null, 35)).toBe(35);
    expect(finalScore(40, null)).toBe(40);
    expect(finalScore(null, null)).toBe(0);
  });
});

it('denseRank ranks ties equally without gaps', () => {
  expect(denseRank([80, 75, 75, 60])).toEqual([1, 2, 2, 3]);
  expect(denseRank([60, 80, 75])).toEqual([3, 1, 2]);
  expect(denseRank([])).toEqual([]);
});

describe('denseRankRows', () => {
  it('breaks a final-score tie on review score', () => {
    const ranks = denseRankRows([
      { finalScore: 80, reviewScore: 38, presentationScore: 42 },
      { finalScore: 80, reviewScore: 42, presentationScore: 38 },
    ]);
    expect(ranks).toEqual([2, 1]);
  });

  it('then breaks a review tie on presentation score', () => {
    const ranks = denseRankRows([
      { finalScore: 80, reviewScore: 40, presentationScore: 40 },
      { finalScore: 80, reviewScore: 40, presentationScore: 39 },
    ]);
    expect(ranks).toEqual([1, 2]);
  });

  it('shares a rank when final, review and presentation all tie', () => {
    const ranks = denseRankRows([
      { finalScore: 80, reviewScore: 40, presentationScore: 40 },
      { finalScore: 80, reviewScore: 40, presentationScore: 40 },
      { finalScore: 75, reviewScore: 40, presentationScore: 35 },
    ]);
    expect(ranks).toEqual([1, 1, 2]);
  });

  it('sorts a missing review below a review of 0', () => {
    const ranks = denseRankRows([
      { finalScore: 50, reviewScore: null, presentationScore: 50 },
      { finalScore: 50, reviewScore: 0, presentationScore: 50 },
    ]);
    expect(ranks).toEqual([2, 1]);
  });

  it('sorts no panellist submissions below submitted zeros', () => {
    const ranks = denseRankRows([
      { finalScore: 50, reviewScore: 50, presentationScore: null },
      { finalScore: 50, reviewScore: 50, presentationScore: 0 },
    ]);
    expect(ranks).toEqual([2, 1]);
  });

  it('ranks by final score before any tie-breaker', () => {
    const ranks = denseRankRows([
      { finalScore: 75, reviewScore: 50, presentationScore: 25 },
      { finalScore: 80, reviewScore: 30, presentationScore: 50 },
    ]);
    expect(ranks).toEqual([2, 1]);
  });

  it('returns ranks in input order', () => {
    const ranks = denseRankRows([
      { finalScore: 60, reviewScore: 30, presentationScore: 30 },
      { finalScore: 80, reviewScore: 40, presentationScore: 40 },
      { finalScore: 75, reviewScore: 40, presentationScore: 35 },
    ]);
    expect(ranks).toEqual([3, 1, 2]);
  });
});

it('fmtScore', () => {
  expect(fmtScore(40)).toBe('40');
  expect(fmtScore(39.5)).toBe('39.5');
  expect(fmtScore(82.25)).toBe('82.25');
  expect(fmtScore(null)).toBe('—');
});

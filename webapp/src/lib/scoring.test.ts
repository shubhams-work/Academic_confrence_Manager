// Port of ../test/scoring_test.dart — keep the same expectations.

import { describe, expect, it } from 'vitest';
import { denseRank, finalScore, fmtScore, presentationScore } from './scoring';

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

it('fmtScore', () => {
  expect(fmtScore(40)).toBe('40');
  expect(fmtScore(39.5)).toBe('39.5');
  expect(fmtScore(82.25)).toBe('82.25');
  expect(fmtScore(null)).toBe('—');
});

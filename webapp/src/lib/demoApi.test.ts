// Port of ../test/demo_backend_test.dart — keep the same expectations.

import { beforeEach, describe, expect, it } from 'vitest';
import { seedDemoStore } from './demo/seed';
import { DemoApi, DemoAuth } from './demo/demoApi';
import { DemoException, type DemoStore } from './demo/store';

let s: DemoStore;
let repo: DemoApi;

beforeEach(() => {
  s = seedDemoStore();
  repo = new DemoApi(s, { lagMs: 0 });
});

function all(v: number): Record<string, number> {
  return { technical: v, originality: v, presentation: v, slides: v, qa: v };
}

describe('DemoApi', () => {
  it('live scores: presentation avg + review = final, dense-ranked per track', async () => {
    s.currentUserId = 'u-chair';
    const rows = await repo.liveScores(1);
    const byPid = new Map(rows.map((r) => [r.pid, r]));

    expect(byPid.get('C101')!.presentationScore).toBe(40); // (42 + 38) / 2
    expect(byPid.get('C101')!.finalScore).toBe(81); // 40 + 41
    expect(byPid.get('C102')!.presentationScore).toBe(36); // only one member submitted
    expect(byPid.get('C102')!.submittedCount).toBe(1);
    expect(byPid.get('C104')!.reviewScore).toBeNull();
    expect(byPid.get('C105')!.memberCount).toBe(0);
    expect(rows.map((r) => r.pid)).toEqual(['C103', 'C101', 'C102', 'C105', 'C104']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('panel member sees only their panels and only their own evaluations', async () => {
    s.currentUserId = 'u-meera';
    const papers = await repo.myPapers();
    expect(papers.map((p) => p.pid)).toEqual(['C101', 'C102', 'C103', 'C104', 'S201', 'S202']);
    const c101 = papers.find((p) => p.pid === 'C101')!;
    expect(c101.evaluations).toHaveLength(1);
    expect(Object.values(c101.evaluations[0]!.marks).reduce((a, b) => a + b, 0)).toBe(42);
  });

  it('scoring: draft, submit, lock, and chair unlock', async () => {
    s.currentUserId = 'u-meera';
    const c103 = s.papers.get('pp-C103')!;
    await repo.saveEvaluation({ paperId: c103.id, marks: { technical: 8 }, comments: '', submit: false });
    await expect(
      repo.saveEvaluation({ paperId: c103.id, marks: { technical: 8 }, comments: '', submit: true }),
    ).rejects.toThrow(DemoException); // cannot submit with criteria missing
    await repo.saveEvaluation({ paperId: c103.id, marks: all(9), comments: 'Good', submit: true });
    await expect(
      repo.saveEvaluation({ paperId: c103.id, marks: all(5), comments: '', submit: false }),
    ).rejects.toThrow(DemoException); // submitted marks are locked

    s.currentUserId = 'u-chair';
    const row = (await repo.liveScores(1)).find((r) => r.pid === 'C103')!;
    expect(row.presentationScore).toBe(44.5); // (44 + 45) / 2
    expect(row.memberCount).toBeGreaterThan(0);
    expect(row.submittedCount).toBeGreaterThanOrEqual(row.memberCount);

    const evalEntry = [...s.evals.values()].find((e) => e.paperId === c103.id && e.memberId === 'm-comp-1')!;
    await repo.unlockEvaluation(evalEntry.id);
    s.currentUserId = 'u-meera';
    await repo.saveEvaluation({ paperId: c103.id, marks: all(7), comments: '', submit: true });
  });

  it('cannot score a paper outside your panel, or marks above 10', async () => {
    s.currentUserId = 'u-sneha';
    await expect(
      repo.saveEvaluation({ paperId: 'pp-C104', marks: all(5), comments: '', submit: true }),
    ).rejects.toThrow(DemoException);
    await expect(
      repo.saveEvaluation({ paperId: 'pp-I403', marks: all(11), comments: '', submit: true }),
    ).rejects.toThrow(DemoException);
  });

  it('panels need exactly two members with different emails; track must match', async () => {
    s.currentUserId = 'u-inc';
    const m1 = { name: 'A', email: 'a@x.com', phone: '', affiliation: '' };
    const m2 = { name: 'B', email: 'b@x.com', phone: '', affiliation: '' };
    await expect(repo.savePanel({ name: 'P', trackId: 3, members: [m1] })).rejects.toThrow(DemoException);
    await expect(
      repo.savePanel({ name: 'P', trackId: 3, members: [m1, { name: 'C', email: 'A@x.com', phone: '', affiliation: '' }] }),
    ).rejects.toThrow(DemoException);
    const id = await repo.savePanel({ name: 'Mechatronics – Panel A', trackId: 3, members: [m1, m2] });
    await repo.setPaperPanel(['pp-M301', 'pp-M302'], id);
    expect((await repo.panel(id))!.papers.map((p) => p.pid)).toEqual(['M301', 'M302']);
    await expect(repo.setPaperPanel(['pp-C105'], id)).rejects.toThrow(
      DemoException,
    ); // Computing paper cannot go to a Mechatronics panel
  });

  it('finalize freezes results and locks the track until reopened', async () => {
    s.currentUserId = 'u-chair';
    await repo.finalizeTrack(1);
    expect((await repo.finalizedScores(1))[0]!.pid).toBe('C103');

    s.currentUserId = 'u-meera';
    await expect(
      repo.saveEvaluation({ paperId: 'pp-C104', marks: all(8), comments: '', submit: false }),
    ).rejects.toThrow(DemoException);

    s.currentUserId = 'u-chair';
    await repo.reopenTrack(1);
    expect(await repo.finalizedScores(1)).toEqual([]);
    s.currentUserId = 'u-meera';
    await repo.saveEvaluation({ paperId: 'pp-C104', marks: all(8), comments: '', submit: false });
  });

  it('role checks: panel member cannot import or finalize', async () => {
    s.currentUserId = 'u-meera';
    await expect(repo.importPapers([])).rejects.toThrow(DemoException);
    await expect(repo.finalizeTrack(1)).rejects.toThrow(DemoException);
  });
});

describe('DemoAuth', () => {
  it('sign-up gives invited emails their role and links panel seats', async () => {
    const auth = new DemoAuth(s);
    await auth.signUp({ email: 'Vikram@demo.edu', password: 'x', fullName: 'Vikram Hegde', phone: '' });
    expect(auth.getSnapshot().role).toBe('panel_member');
    expect(s.members.get('m-is-2')!.profileId).toBe(s.currentUserId);

    await auth.signOut();
    await auth.signUp({ email: 'stranger@demo.edu', password: 'x', fullName: 'X', phone: '' });
    expect(auth.getSnapshot().role).toBeNull(); // uninvited email gets no role
  });
});

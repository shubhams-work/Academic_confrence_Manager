// React-query hooks and keys for every Api call.
// Mutations invalidate the lists they affect; queries refetch on window focus
// and use a ~30 s staleTime (set in main.tsx).

import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  getApi,
  type BulkCreateMembersResult,
  type DeletePanelistResult,
  type MemberDraft,
} from './api';
import type { AppRole, PanelMemberInput, ResetSummary } from './types';
import type { PaperDraftJson, ReviewScoreDraft } from './importParse';

// ---------- Query keys ----------
export const qk = {
  profile: (userId: string) => ['profile', userId] as const,
  tracks: ['tracks'] as const,
  criteria: ['criteria'] as const,
  papers: (trackId: number | null) => ['papers', trackId ?? 'all'] as const,
  myPapers: ['my-papers'] as const,
  panels: (trackId: number | null) => ['panels', trackId ?? 'all'] as const,
  panel: (id: string) => ['panel', id] as const,
  liveScores: (trackId: number | null) => ['live-scores', trackId ?? 'all'] as const,
  finalizedScores: (trackId: number | null) => ['finalized-scores', trackId ?? 'all'] as const,
  staffInvites: ['staff-invites'] as const,
  staffProfiles: ['staff-profiles'] as const,
};

// ---------- Queries ----------
export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: qk.profile(userId ?? ''),
    queryFn: () => getApi().profile(userId!),
    enabled: userId != null,
  });
}

export function useTracks() {
  return useQuery({ queryKey: qk.tracks, queryFn: () => getApi().tracks() });
}

export function useCriteria() {
  return useQuery({ queryKey: qk.criteria, queryFn: () => getApi().criteria() });
}

export function usePapers(trackId: number | null) {
  return useQuery({
    queryKey: qk.papers(trackId),
    queryFn: () => getApi().papers(trackId ?? undefined),
  });
}

export function useMyPapers() {
  return useQuery({ queryKey: qk.myPapers, queryFn: () => getApi().myPapers() });
}

export function usePanels(trackId: number | null) {
  return useQuery({
    queryKey: qk.panels(trackId),
    queryFn: () => getApi().panels(trackId ?? undefined),
  });
}

export function usePanel(id: string | null) {
  return useQuery({
    queryKey: qk.panel(id ?? ''),
    queryFn: () => getApi().panel(id!),
    enabled: id != null,
  });
}

export function useLiveScores(trackId: number | null) {
  return useQuery({
    queryKey: qk.liveScores(trackId),
    queryFn: () => getApi().liveScores(trackId ?? undefined),
  });
}

export function useFinalizedScores(trackId: number | null) {
  return useQuery({
    queryKey: qk.finalizedScores(trackId),
    queryFn: () => getApi().finalizedScores(trackId ?? undefined),
  });
}

export function useStaffInvites() {
  return useQuery({ queryKey: qk.staffInvites, queryFn: () => getApi().staffInvites() });
}

export function useStaffProfiles() {
  return useQuery({ queryKey: qk.staffProfiles, queryFn: () => getApi().staffProfiles() });
}

// ---------- Mutations ----------

export function useImportPapers(): UseMutationResult<{ inserted: number; updated: number }, Error, PaperDraftJson[]> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: PaperDraftJson[]) => getApi().importPapers(rows),
    onSuccess: () => invalidateLists(qc, ['papers', 'panels', 'panel', 'live-scores', 'my-papers']),
  });
}

export function useSavePaper(): UseMutationResult<void, Error, PaperDraftJson> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: PaperDraftJson) => getApi().savePaper(draft),
    onSuccess: () => invalidateLists(qc, ['papers', 'panels', 'panel', 'live-scores', 'my-papers']),
  });
}

export function useImportReviewScores(): UseMutationResult<
  { updated: number; unknown: string[] },
  Error,
  ReviewScoreDraft[]
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: ReviewScoreDraft[]) => getApi().importReviewScores(rows),
    onSuccess: () => invalidateLists(qc, ['papers', 'live-scores', 'finalized-scores']),
  });
}

export function useDeletePaper(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().deletePaper(id),
    onSuccess: () => invalidateLists(qc, ['papers', 'panels', 'panel', 'live-scores']),
  });
}

export interface SavePanelInput {
  id?: string;
  name: string;
  trackId: number;
  venue?: string | null;
  scheduledAt?: string | null;
  members: PanelMemberInput[];
}

export function useSavePanel(): UseMutationResult<string, Error, SavePanelInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePanelInput) => getApi().savePanel(input),
    onSuccess: () => invalidateLists(qc, ['panels', 'panel', 'papers', 'live-scores', 'my-papers']),
  });
}

export function useDeletePanel(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().deletePanel(id),
    onSuccess: () => invalidateLists(qc, ['panels', 'panel', 'papers', 'live-scores', 'my-papers']),
  });
}

export function useSetPaperPanel(): UseMutationResult<void, Error, { paperIds: string[]; panelId: string | null }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paperIds, panelId }: { paperIds: string[]; panelId: string | null }) =>
      getApi().setPaperPanel(paperIds, panelId),
    onSuccess: () => invalidateLists(qc, ['panels', 'panel', 'papers', 'live-scores', 'my-papers']),
  });
}

export interface SaveEvaluationInput {
  paperId: string;
  marks: Record<string, number>;
  comments: string;
  submit: boolean;
}

export function useSaveEvaluation(): UseMutationResult<void, Error, SaveEvaluationInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveEvaluationInput) => getApi().saveEvaluation(input),
    onSuccess: () => invalidateLists(qc, ['my-papers', 'panel', 'panels', 'live-scores']),
  });
}

export function useUnlockEvaluation(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evaluationId: string) => getApi().unlockEvaluation(evaluationId),
    onSuccess: () => invalidateLists(qc, ['my-papers', 'panel', 'panels', 'live-scores']),
  });
}

export function useFinalizeTrack(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trackId: number) => getApi().finalizeTrack(trackId),
    onSuccess: () =>
      invalidateLists(qc, ['tracks', 'live-scores', 'finalized-scores', 'panels', 'panel', 'papers', 'my-papers']),
  });
}

export function useReopenTrack(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trackId: number) => getApi().reopenTrack(trackId),
    onSuccess: () =>
      invalidateLists(qc, ['tracks', 'live-scores', 'finalized-scores', 'panels', 'panel', 'papers', 'my-papers']),
  });
}

export function useAddStaffInvite(): UseMutationResult<void, Error, { email: string; role: AppRole }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: AppRole }) => getApi().addStaffInvite(email, role),
    onSuccess: () => invalidateLists(qc, ['staff-invites', 'staff-profiles']),
  });
}

export function useRemoveStaffInvite(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => getApi().removeStaffInvite(email),
    onSuccess: () => invalidateLists(qc, ['staff-invites', 'staff-profiles']),
  });
}

export function useSetResetAccess(): UseMutationResult<void, Error, { email: string; enabled: boolean }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, enabled }: { email: string; enabled: boolean }) =>
      getApi().setResetAccess(email, enabled),
    onSuccess: () => invalidateLists(qc, ['staff-profiles', 'profile']),
  });
}

/** Wipes evaluations, panels/members and review scores, then refetches everything. */
export function useResetTrainingData(): UseMutationResult<ResetSummary, Error, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirmPhrase: string) => getApi().resetTrainingData(confirmPhrase),
    onSuccess: () =>
      invalidateLists(qc, [
        'tracks',
        'papers',
        'my-papers',
        'panels',
        'panel',
        'panel-member-suggestions',
        'live-scores',
        'finalized-scores',
      ]),
  });
}

export function useBulkCreateMembers(): UseMutationResult<
  BulkCreateMembersResult,
  Error,
  { rows: MemberDraft[]; role?: AppRole }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, role }: { rows: MemberDraft[]; role?: AppRole }) =>
      getApi().bulkCreateMembers(rows, role),
    onSuccess: () =>
      invalidateLists(qc, [
        'staff-profiles',
        'staff-invites',
        'panels',
        'panel',
        'panel-member-suggestions',
        'panelists',
      ]),
  });
}

/** Replaces a panelist's password and returns the new one (shown once). */
export function useResetPanelistPassword(): UseMutationResult<
  { email: string; password: string },
  Error,
  string
> {
  return useMutation({
    mutationFn: (email: string) => getApi().resetPanelistPassword(email),
  });
}

/**
 * Chair only: delete a panelist outright. Rejects with NeedsForceError when
 * they have submitted scores, so the caller can confirm and retry with force.
 */
export function useDeletePanelist(): UseMutationResult<
  DeletePanelistResult,
  Error,
  { email: string; force?: boolean }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, force }: { email: string; force?: boolean }) =>
      getApi().deletePanelist(email, force ?? false),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['panelists'] });
      void qc.invalidateQueries({ queryKey: ['panels'] });
      void qc.invalidateQueries({ queryKey: ['panel'] });
    },
  });
}

/** Every panelist, including those on no panel. */
export function usePanelists() {
  return useQuery({ queryKey: ['panelists'], queryFn: () => getApi().allPanelists() });
}

export function usePanelMemberSuggestions() {
  return useQuery({
    queryKey: ['panel-member-suggestions'],
    queryFn: () => getApi().availablePanelMembers(),
  });
}

// ---------- helpers ----------

function invalidateLists(qc: ReturnType<typeof useQueryClient>, prefixes: string[]): Promise<unknown> {
  return Promise.all(prefixes.map((p) => qc.invalidateQueries({ queryKey: [p] })));
}


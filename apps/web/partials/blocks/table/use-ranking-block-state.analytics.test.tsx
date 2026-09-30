import { act, cleanup, renderHook } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, expect, it, vi } from 'vitest';

import { ActionContextProvider } from '~/core/action-context-provider';

import { useRankingBlockState } from './use-ranking-block-state';

const { capture, submission, empty, prepare } = vi.hoisted(() => ({
  capture: vi.fn(),
  prepare: vi.fn().mockResolvedValue(undefined),
  empty: [],
  submission: {
    id: 'my-rank',
    authorSpaceId: 'my-space',
    orderedEntityIds: [],
    author: { name: 'Author', avatarUrl: null },
  },
}));
vi.mock('~/core/analytics', () => ({ capture }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
  usePathname: () => '/explore',
  useSearchParams: () => null,
}));
vi.mock('~/partials/onboarding/dialog', () => ({ stepAtom: {} }));
vi.mock('~/atoms/post-onboarding-redirect', () => ({ postOnboardingRedirectAtom: {} }));
vi.mock('~/atoms/ranking-compose-return', () => ({ rankingComposeReturnHrefAtom: {} }));
vi.mock('jotai', () => ({ useSetAtom: () => vi.fn() }));
vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({
    name: 'Private ranking title',
    entityId: 'block',
    relationId: 'relation',
    rows: empty,
    pageSize: 10,
  }),
}));
vi.mock('~/core/state/editor/editor-provider', () => ({ useEditorInstance: () => ({ id: 'parent' }) }));
vi.mock('~/core/state/editor/use-editor', () => ({ useEditorStoreLite: () => ({ blockRelations: empty }) }));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useCanUserEdit: () => false }));
vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => false }));
vi.mock('~/core/hooks/use-onboarding', () => ({ useOnboarding: () => ({}) }));
vi.mock('~/core/hooks/use-ranking-compose-access', () => ({ useRankingComposeAccess: () => ({ status: 'ready' }) }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({}) }));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({}) }));
vi.mock('~/core/blocks/data/use-filters', () => ({ useFilters: () => ({ filterState: empty }) }));
vi.mock('~/core/blocks/ranking/use-ranking-scope', () => ({ useRankingScope: () => ({}) }));
vi.mock('~/core/blocks/ranking/ranking-scope', () => ({ getScopeFromFilters: () => ({ type: 'ALL' }) }));
vi.mock('~/core/blocks/ranking/use-ranking-block-dates', () => ({ useRankingBlockDates: () => ({}) }));
vi.mock('~/core/blocks/ranking/use-ranking-period', () => ({ useRankingPeriod: () => ({}) }));
vi.mock('~/core/blocks/ranking/use-ranking-submissions', () => ({
  useRankingSubmissions: () => ({
    submissions: empty,
    hasMySubmission: true,
    mySubmission: submission,
    personalSpaceId: 'my-space',
  }),
}));
vi.mock('~/core/blocks/ranking/use-shared-ranking', () => ({ useSharedRanking: () => ({}) }));
vi.mock('~/core/blocks/ranking/use-ranking-block-relations', () => ({
  useRankingBlockRelations: () => ({
    globalRankingEntityIds: empty,
    aggregatedSubmitterSpaceIds: empty,
    aggregatedRankingCount: 0,
  }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: empty }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-pending-proposals', () => ({
  useRankingPendingEntities: () => ({
    pendingEntriesByEntityId: new Map(),
    pendingEntityIds: new Set(),
  }),
}));
vi.mock('~/core/blocks/ranking/local-ranking-my-draft', () => ({ loadLocalMyRankingDraft: () => null }));
vi.mock('~/core/blocks/ranking/ranking-og-generate-client', () => ({
  generatePersonalRankingOgImages: prepare,
  generateGlobalRankingOgImages: prepare,
}));
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ActionContextProvider value={{ overlay: 'entity_side_panel', list_id: 'profile_activity', item_position: 3 }}>
      {children}
    </ActionContextProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  capture.mockReset();
  prepare.mockClear();
});

it.each(['personal', 'viewer'] as const)(
  'observes the %s ranking X handoff synchronously with its actual target',
  mode => {
    window.history.replaceState({}, '', '/explore');
    // noopener can return null even on a successful handoff; the post outcome is unknown.
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(
      () =>
        useRankingBlockState({
          spaceId: 'space',
          ...(mode === 'viewer'
            ? { sharedRankEntityId: 'someone-elses-rank', sharedAuthorSpaceId: 'their-space' }
            : {}),
        }),
      { wrapper }
    );
    act(() => {
      if (mode === 'personal') result.current.sharePersonalRanking();
      else result.current.shareViewerOwnRanking();
      expect(open).toHaveBeenCalledTimes(1); // before leaving user activation
    });
    const intent = new URL(open.mock.calls[0][0] as string);
    expect(intent.origin).toBe('https://x.com');
    expect(new URL(intent.searchParams.get('url')!).pathname).toBe('/r/my-rank');
    expect(intent.searchParams.get('text')).toContain('Private ranking title');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({
        action_kind: 'share',
        outcome: 'unknown',
        target_type: 'ranking',
        target_id: 'my-rank',
        component: 'share_dialog',
        page_path: '/explore',
        overlay: 'entity_side_panel',
        list_id: 'profile_activity',
        item_position: 3,
      })
    );
    expect(JSON.stringify(capture.mock.calls)).not.toContain('Private ranking title');
    if (mode === 'personal') expect(open.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0]);
  }
);

it('preserves a thrown popup error and records the failed attempt', () => {
  const error = new Error('popup unavailable');
  vi.spyOn(window, 'open').mockImplementation(() => {
    throw error;
  });
  const { result } = renderHook(() => useRankingBlockState({ spaceId: 'space' }), { wrapper });
  expect(() => result.current.sharePersonalRanking()).toThrow(error);
  expect(capture).toHaveBeenCalledWith(
    'action_completed',
    expect.objectContaining({
      action_kind: 'share',
      outcome: 'failed',
      failure_code: 'unavailable',
      target_id: 'my-rank',
    })
  );
});

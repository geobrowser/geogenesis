import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PeriodDebate, nyDayStartMs } from '~/core/blocks/ranking/best-debates-views';

import { TableBlockRanking } from './table-block-ranking';
import { useRankingBlockState } from './use-ranking-block-state';

/**
 * GEO-3677 review: the Best debates block mounted through `TableBlockRanking` and the real
 * `useRankingBlockState`, so the team order it gets and the compose guard are the ones a page
 * uses, not a hand-built state.
 */

const TODAY = '2026-11-11';
const BLOCK = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0';
const OTHER_BLOCK = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1';
const DEBATES_SPACE = '9284477c8fe746368698994e2e517b32';
/** Twelve placed debates: one more page than the embedded block's 9-row page. */
const TEAM = Array.from({ length: 12 }, (_, index) => `d${String(index + 1).padStart(2, '0')}`);

const mocks = vi.hoisted(() => ({
  blockId: 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0',
  flag: false,
  member: false,
  ensureAccess: vi.fn(),
  push: vi.fn(),
  window: [] as PeriodDebate[],
  entriesLoading: false,
  untitled: new Set<string>(),
  empty: [] as never[],
}));

vi.mock('~/core/analytics', () => ({ capture: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/space/debates',
  useSearchParams: () => null,
}));
vi.mock('~/partials/onboarding/onboarding-atoms', () => ({ stepAtom: {} }));
vi.mock('~/atoms/post-onboarding-redirect', () => ({ postOnboardingRedirectAtom: {} }));
vi.mock('~/atoms/ranking-compose-return', () => ({ rankingComposeReturnHrefAtom: {} }));
vi.mock('~/core/state/pending-personal-space', () => ({ usePendingPersonalSpace: () => ({ isPending: false }) }));
vi.mock('jotai', async importOriginal => ({
  ...(await importOriginal<typeof import('jotai')>()),
  useSetAtom: () => vi.fn(),
}));
vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({
    name: 'Best debates',
    entityId: mocks.blockId,
    relationId: 'relation',
    rows: mocks.empty,
    // DEFAULT_DATA_BLOCK_PAGE_SIZE: the embedded block's page.
    pageSize: 9,
  }),
}));
vi.mock('~/core/state/editor/editor-provider', () => ({ useEditorInstance: () => ({ id: 'parent' }) }));
vi.mock('~/core/state/editor/use-editor-blocks', () => ({
  useEditorStoreLite: () => ({ blockRelations: mocks.empty }),
}));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useCanUserEdit: () => false, useUserIsEditing: () => false }));
vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => false }));
vi.mock('~/core/hooks/use-onboarding', () => ({ useOnboarding: () => ({ showOnboarding: vi.fn() }) }));
vi.mock('~/core/hooks/use-ranking-compose-access', () => ({
  useRankingComposeAccess: () => ({
    status: mocks.member ? 'ready' : 'needs-membership',
    canEdit: mocks.member,
    ensureAccess: mocks.ensureAccess,
    promptLogin: vi.fn(),
  }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0x1' } } }),
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({}) }));
vi.mock('~/core/blocks/data/use-filters', () => ({
  useFilters: () => ({ filterState: mocks.empty, resolvedFilterState: mocks.empty, modesByColumn: {} }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-scope', () => ({ useRankingScope: () => ({ source: { type: 'ALL' } }) }));
vi.mock('~/core/blocks/ranking/ranking-scope', () => ({ getScopeFromFilters: () => ({ type: 'ALL' }) }));
vi.mock('~/core/blocks/ranking/use-ranking-block-dates', () => ({ useRankingBlockDates: () => ({}) }));
vi.mock('~/core/blocks/ranking/use-ranking-period', () => ({ useRankingPeriod: () => ({}) }));
vi.mock('~/core/blocks/ranking/use-ranking-submissions', () => ({
  useRankingSubmissions: () => ({ submissions: mocks.empty, hasMySubmission: false, personalSpaceId: 'me' }),
}));
vi.mock('~/core/blocks/ranking/use-shared-ranking', () => ({ useSharedRanking: () => ({}) }));
vi.mock('~/core/blocks/ranking/use-ranking-block-relations', () => ({
  useRankingBlockRelations: () => ({
    isLoadingRelations: false,
    globalRankingEntityIds: TEAM,
    aggregatedSubmitterSpaceIds: mocks.empty,
    aggregatedRankingCount: 1,
  }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  // Every placed debate resolves to a name, so none is hidden as a placeholder.
  useRankingEntryEntities: (_spaceId: string, ids: string[]) =>
    mocks.entriesLoading
      ? { entries: [], isLoading: true }
      : {
          entries: ids.map(id => ({
            entityId: id,
            // An untitled (deleted or unnamed) placed debate is hidden from the team order.
            name: mocks.untitled.has(id) ? 'Untitled' : `Debate ${id}`,
            description: null,
            image: null,
          })),
          isLoading: false,
        },
}));
vi.mock('~/core/blocks/ranking/use-ranking-pending-proposals', () => ({
  useRankingPendingEntities: () => ({ pendingEntriesByEntityId: new Map(), pendingEntityIds: new Set() }),
}));
vi.mock('~/core/blocks/ranking/local-ranking-my-draft', () => ({ loadLocalMyRankingDraft: () => null }));
vi.mock('~/core/blocks/ranking/use-best-debates', () => ({
  useNyTodayKey: () => '2026-11-11',
  useBestDebatesRankers: () => ({ status: 'ready', rankerCount: () => 1, retry: vi.fn() }),
  useBestDebatesWindow: ({ enabled = true }: { enabled?: boolean }) => ({
    data: enabled ? mocks.window : undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Header chrome and children with their own data, none of it under test here.
vi.mock('./block-link-ingestion-tool', () => ({
  BlockLinkIngestionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  BlockLinkIngestionChip: () => null,
  BlockLinkIngestionPanel: () => null,
}));
vi.mock('./data-block-expand-control', () => ({ DataBlockExpandControl: () => null }));
vi.mock('./data-block-scope-dropdown', () => ({ DataBlockScopeDropdown: () => null }));
vi.mock('./data-block-view-menu', () => ({ DataBlockViewMenu: () => null }));
vi.mock('./ranking-period-metadata', () => ({ RankingPeriodMetadata: () => null }));
vi.mock('./table-block-context-menu', () => ({ TableBlockContextMenu: () => null }));
vi.mock('./table-block-editable-filters', () => ({ TableBlockEditableFilters: () => null }));
vi.mock('./ranking-compose-entity-sheet', () => ({ RankingComposeEntitySheet: () => null }));
vi.mock('./ranking-block-ui', () => ({
  RankingGlobalDesktopRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./ranking-entry-row', () => ({
  RankingEntryRow: ({ rank, entry }: { rank?: number; entry: { name: string } }) => (
    <div data-testid="row">
      <span data-testid="place">{rank ?? '-'}</span>
      <span data-testid="name">{entry.name}</span>
    </div>
  ),
  RankingEntryRowSkeleton: () => <div data-testid="skeleton" />,
}));

const noon = (key: string) => nyDayStartMs(key) + 12 * 3_600_000;

beforeEach(() => {
  mocks.blockId = BLOCK;
  mocks.flag = false;
  mocks.member = false;
  mocks.ensureAccess.mockReset();
  mocks.push.mockReset();
  mocks.entriesLoading = false;
  mocks.untitled = new Set();
  // Today's only debate is the team's #12.
  mocks.window = [{ id: 'd12', name: 'Debate d12', createdAtMs: noon(TODAY) }];
});

afterEach(cleanup);

describe('Best debates through TableBlockRanking', () => {
  it('pages the whole team order itself, past the embedded 9-row page', () => {
    render(<TableBlockRanking spaceId={DEBATES_SPACE} bestDebatesBlockId={BLOCK} />);

    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    expect(screen.getAllByTestId('row')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getAllByTestId('row')).toHaveLength(12);
    expect(screen.getAllByTestId('place').at(-1)).toHaveTextContent('12');
  });

  it('keeps a Day debate at its team place 12', () => {
    render(<TableBlockRanking spaceId={DEBATES_SPACE} bestDebatesBlockId={BLOCK} />);

    // Day shows today's debates in team order, numbered by their team place.
    expect(screen.getAllByTestId('name').map(node => node.textContent)).toEqual(['Debate d12']);
    expect(screen.getByTestId('place')).toHaveTextContent('12');
    expect(screen.queryByText(/Not ranked yet/)).not.toBeInTheDocument();
  });
});

describe('team places settle before they show', () => {
  it('shows skeletons, not provisional numbers, while the entries that hide untitled places load', () => {
    // d01 will turn out untitled, so today's d12 is really #11; until the entries land it would
    // read #12 from the window read's name.
    mocks.untitled = new Set(['d01']);
    mocks.entriesLoading = true;
    render(<TableBlockRanking spaceId={DEBATES_SPACE} bestDebatesBlockId={BLOCK} />);

    expect(screen.queryAllByTestId('place')).toHaveLength(0);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('numbers the places after an untitled one is hidden', () => {
    mocks.untitled = new Set(['d01']);
    render(<TableBlockRanking spaceId={DEBATES_SPACE} bestDebatesBlockId={BLOCK} />);

    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    expect(screen.getAllByTestId('name')[0]).toHaveTextContent('Debate d02');
    expect(screen.getAllByTestId('place')[0]).toHaveTextContent('1');
    // Today's d12 is the team's #11 once d01 is hidden, in Day too.
    fireEvent.click(screen.getByRole('radio', { name: 'Day' }));
    expect(screen.getByTestId('place')).toHaveTextContent('11');
  });
});

describe('compose guard on the Best debates block', () => {
  const state = () =>
    renderHook(() => useRankingBlockState({ spaceId: DEBATES_SPACE, bestDebatesBlockId: BLOCK })).result;

  it.each([
    ['a non-member with the flag on', { flag: true, member: false }],
    ['a member with the flag off', { flag: false, member: true }],
  ])('never requests membership for %s, from any edit entry point', async (_label, who) => {
    mocks.flag = who.flag;
    mocks.member = who.member;
    const result = state();

    expect(result.current.canComposeEdit).toBe(false);
    await act(() => result.current.openRankingCompose('edit'));
    expect(mocks.ensureAccess).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    // Fullscreen (view mode) still opens, and asks for nothing.
    await act(() => result.current.openRankingCompose('view'));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push.mock.calls[0][0]).toContain('mode=view');
    expect(mocks.ensureAccess).not.toHaveBeenCalled();
  });

  it('lets a member with the flag on compose, with Rank the rest’s To rank param', async () => {
    mocks.flag = true;
    mocks.member = true;
    const result = state();

    expect(result.current.canComposeEdit).toBe(true);
    await act(() => result.current.openRankingCompose('edit', { team: 'to-rank' }));
    expect(mocks.ensureAccess).toHaveBeenCalledTimes(1);
    expect(mocks.push.mock.calls[0][0]).toMatch(/ranking-compose\?.*&team=to-rank$/);
  });

  it('leaves every other ranking block as it was', async () => {
    mocks.blockId = OTHER_BLOCK;
    const result = state();

    expect(result.current.isBestDebates).toBe(false);
    expect(result.current.canComposeEdit).toBe(true);
    await act(() => result.current.openRankingCompose('edit'));
    expect(mocks.ensureAccess).toHaveBeenCalledTimes(1);
  });
});

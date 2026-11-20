import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RecentDebate } from '~/core/blocks/ranking/best-debates-debates';
import type { BestDebateRowData } from '~/core/blocks/ranking/use-best-debate-displays';
import type { RankersRead } from '~/core/blocks/ranking/use-best-debates-to-rank';

import { RANKING_ENTITY_DRAG_TYPE } from '../ranking-entity-drag';
import { BestDebateDisplaysContext, BestDebateWatchContext } from './best-debate-row';
import { resetCollapsedSpacesForTests } from './best-debates-team-row';
import { BestDebatesToRankList } from './best-debates-to-rank-list';

vi.mock('../ranking-entry-row', () => ({
  RankingEntryRow: ({
    entry,
    actions,
    debateAside,
  }: {
    entry: { name: string };
    actions?: React.ReactNode;
    debateAside?: React.ReactNode;
  }) => (
    <span>
      {entry.name}
      {actions}
      {debateAside}
    </span>
  ),
}));

afterEach(cleanup);

const debates: RecentDebate[] = [
  { entityId: 'd1', name: 'Newest', createdAtMs: 2, spaceId: 's' },
  { entityId: 'd2', name: 'Older', createdAtMs: 1, spaceId: 's' },
];

function rankers(overrides: Partial<RankersRead> = {}): RankersRead {
  return {
    status: 'ready',
    rankersOf: id => (id === 'd2' ? [{ name: 'Preston' } as never] : []),
    rankerCount: id => (id === 'd2' ? 1 : 0),
    invalidate: async () => undefined,
    ...overrides,
  };
}

const renderList = (props: Partial<React.ComponentProps<typeof BestDebatesToRankList>> = {}) =>
  render(
    <BestDebatesToRankList
      debates={debates}
      isLoading={false}
      error={null}
      rankers={rankers()}
      entriesById={new Map()}
      onPlace={vi.fn()}
      draggable
      {...props}
    />
  );

describe('To rank', () => {
  it('lists the debates in the order given, saying who has ranked each', () => {
    renderList();
    // The rows aren't buttons (their Rank and Down rank controls are), so these are the only Rank ones.
    const ranks = screen.getAllByRole('button', { name: /^Rank / });
    expect(ranks.map(button => button.getAttribute('aria-label'))).toEqual(['Rank Newest', 'Rank Older']);
    expect(screen.getAllByTestId('best-debates-to-rank-row')).toHaveLength(2);
    for (const row of screen.getAllByTestId('best-debates-to-rank-row')) expect(row.getAttribute('role')).toBeNull();
    expect(screen.getByText('Nobody has ranked this yet')).toBeTruthy();
    expect(screen.getByText('Ranked by Preston')).toBeTruthy();
  });

  it('never says "Nobody" while the read is loading or has failed', () => {
    renderList({ rankers: rankers({ status: 'loading', rankerCount: () => null, rankersOf: () => null }) });
    expect(screen.queryByText('Nobody has ranked this yet')).toBeNull();
    cleanup();
    renderList({ rankers: rankers({ status: 'error', rankerCount: () => null, rankersOf: () => null }) });
    expect(screen.queryByText('Nobody has ranked this yet')).toBeNull();
  });

  it('opens a debate to watch from its row, and ranks it only from its Rank button', () => {
    const onPlace = vi.fn();
    const watch = vi.fn();
    render(
      <BestDebateWatchContext.Provider value={watch}>
        <BestDebatesToRankList
          debates={debates}
          isLoading={false}
          error={null}
          rankers={rankers()}
          entriesById={new Map()}
          onPlace={onPlace}
          draggable
        />
      </BestDebateWatchContext.Provider>
    );
    fireEvent.click(screen.getByText('Newest'));
    expect(watch).toHaveBeenCalledWith('d1', 'row');
    expect(onPlace).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Rank Newest' }), { key: 'Enter' });
    expect(watch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rank Newest' }));
    expect(onPlace).toHaveBeenCalledWith('d1');
    expect(watch).toHaveBeenCalledTimes(1);
  });

  it('places a debate from its Rank button, and the row can be dragged', () => {
    const onPlace = vi.fn();
    renderList({ onPlace });
    fireEvent.click(screen.getByRole('button', { name: 'Rank Newest' }));
    expect(onPlace).toHaveBeenCalledWith('d1');
    const row = screen.getAllByTestId('best-debates-to-rank-row')[0];

    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(RANKING_ENTITY_DRAG_TYPE, 'd1');
  });

  it('pushes a debate down from its row without placing it', () => {
    const onPlace = vi.fn();
    const onPushDown = vi.fn();
    renderList({ onPlace, onPushDown });
    const button = screen.getByRole('button', { name: 'Down rank Newest' });
    expect(button.getAttribute('title')).toBe('Down rank');
    // Inline, straight after the ranked-by badge, with a visible label.
    expect(button.previousElementSibling?.textContent).toBe('Nobody has ranked this yet');
    expect(button.textContent).toBe('Down rank');
    fireEvent.click(button);
    expect(onPushDown).toHaveBeenCalledWith('d1');
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('starts the line with Push down when a row has no badge yet', () => {
    renderList({
      onPushDown: vi.fn(),
      rankers: rankers({ status: 'loading', rankerCount: () => null, rankersOf: () => null }),
    });
    const button = screen.getByRole('button', { name: 'Down rank Newest' });
    expect(button.previousElementSibling).toBeNull();
  });

  it('says so when nothing is left', () => {
    renderList({ debates: [] });
    expect(screen.getByText('You’re up to date.')).toBeTruthy();
  });

  it('filters by the search and topics, and groups by space', () => {
    const data = (title: string, space: string, topic: string): BestDebateRowData => ({
      entityId: '',
      title,
      debaterSpaceIds: [],
      ownSpaceId: space,
      createdAtMs: null,
      topics: [{ id: topic, name: topic }],
      keyframeUrl: null,
      debaters: null,
      space: { id: space, name: space === 'sp1' ? 'US Politics' : 'Relationships', image: null },
    });
    const displays = new Map([
      ['d1', data('Tariffs hurt farmers', 'sp1', 'economy')],
      ['d2', data('Dating apps should verify IDs', 'sp2', 'dating')],
    ]);
    const withDisplays = (props: Partial<React.ComponentProps<typeof BestDebatesToRankList>>) =>
      render(
        <BestDebateDisplaysContext.Provider value={displays}>
          <BestDebatesToRankList
            debates={debates}
            isLoading={false}
            error={null}
            rankers={rankers()}
            entriesById={new Map()}
            onPlace={vi.fn()}
            draggable
            {...props}
          />
        </BestDebateDisplaysContext.Provider>
      );

    withDisplays({ query: 'tariffs' });
    expect(screen.getAllByRole('button', { name: /^Rank / }).map(row => row.getAttribute('aria-label'))).toEqual([
      'Rank Newest',
    ]);
    cleanup();

    withDisplays({ topicIds: ['dating'] });
    expect(screen.getAllByRole('button', { name: /^Rank / }).map(row => row.getAttribute('aria-label'))).toEqual([
      'Rank Older',
    ]);
    cleanup();

    withDisplays({ query: 'nothing like this' });
    expect(screen.getByText('No debates match.')).toBeTruthy();
    cleanup();

    withDisplays({ groupBySpace: true });
    expect(screen.getAllByTestId('space-group').map(group => group.getAttribute('aria-label'))).toEqual([
      'US Politics',
      'Relationships',
    ]);
    cleanup();

    // Collapsing: only the header (with its count) stays, it is remembered, and a filter never
    // opens it again.
    window.localStorage.removeItem('geo.bestDebates.collapsedSpaces');
    resetCollapsedSpacesForTests();
    withDisplays({ groupBySpace: true });
    const header = screen.getByRole('button', { name: /US Politics · 1/ });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Rank Newest' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Rank Older' })).toBeTruthy();
    cleanup();

    withDisplays({ groupBySpace: true, query: 'tariffs' });
    expect(screen.getByRole('button', { name: /US Politics · 1/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Rank Newest' })).toBeNull();
    cleanup();

    withDisplays({ groupBySpace: true });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByRole('button', { name: /^Rank / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByRole('button', { name: /^Rank / })).toHaveLength(2);
    // Collapse all sits on the first header's row, not a row of its own.
    expect(
      screen.getByRole('button', { name: 'Collapse all' }).previousElementSibling?.getAttribute('aria-expanded')
    ).toBe('true');
    cleanup();

    // Remembered per viewer: a fresh page reads it back from storage.
    window.localStorage.setItem('geo.bestDebates.collapsedSpaces', JSON.stringify(['sp2']));
    resetCollapsedSpacesForTests();
    withDisplays({ groupBySpace: true });
    expect(screen.getByRole('button', { name: /Relationships · 1/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Rank Older' })).toBeNull();
    window.localStorage.removeItem('geo.bestDebates.collapsedSpaces');
    resetCollapsedSpacesForTests();
  });
});

describe('To rank: Show ranked debates (GEO-3810)', () => {
  const display = (title: string): BestDebateRowData => ({
    entityId: '',
    title,
    debaterSpaceIds: [],
    ownSpaceId: 'own',
    createdAtMs: null,
    topics: [{ id: 'economy', name: 'economy' }],
    keyframeUrl: null,
    debaters: null,
    space: null,
  });
  const displays = new Map([
    ['d1', display('Tariffs hurt farmers')],
    ['d2', display('Dating apps should verify IDs')],
    ['r1', display('Tariffs raise prices')],
    ['r2', display('Cats beat dogs')],
    ['r3', display('Tariffs protect jobs')],
    ['p1', display('Tariffs are a tax')],
  ]);
  const names: Record<string, string> = {
    d1: 'Newest',
    r1: 'Ranked one',
    r2: 'Ranked two',
    r3: 'Ranked three',
    p1: 'Pushed',
  };
  const matches = { ranked: ['r1', 'r2', 'r3'], downRanked: ['p1'], capped: false };
  const list = (props: Partial<React.ComponentProps<typeof BestDebatesToRankList>> = {}, watch = vi.fn()) => (
    <BestDebateWatchContext.Provider value={watch}>
      <BestDebateDisplaysContext.Provider value={displays}>
        <BestDebatesToRankList
          debates={debates}
          isLoading={false}
          error={null}
          // No ranked-by badges, so a row's text is its name and its place.
          rankers={rankers({ status: 'loading', rankerCount: () => null, rankersOf: () => null })}
          entriesById={new Map()}
          onPlace={vi.fn()}
          onPushDown={vi.fn()}
          draggable
          rankedMatches={matches}
          nameOf={id => names[id] ?? null}
          {...props}
        />
      </BestDebateDisplaysContext.Provider>
    </BestDebateWatchContext.Provider>
  );
  const rankedRows = () => screen.queryAllByTestId('best-debates-to-rank-ranked-row').map(row => row.textContent);

  it('isn’t there without a search or filter', () => {
    render(list());
    expect(screen.queryByRole('button', { name: /ranked debates/ })).toBeNull();
    render(list({ debates: [] }));
    expect(screen.queryByRole('button', { name: /ranked debates/ })).toBeNull();
  });

  it('shows the ranked matches in your order with their place, then the down ranked ones', () => {
    const watch = vi.fn();
    render(list({ query: 'tariffs' }, watch));
    const toggle = screen.getByRole('button', { name: 'Show ranked debates (3)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('data-geo-analytics-label')).toBe('Best debates show ranked');
    expect(rankedRows()).toEqual([]);

    fireEvent.click(toggle);
    expect(toggle.textContent).toBe('Hide ranked debates (3)');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('data-geo-analytics-label')).toBe('Best debates hide ranked');
    // r2 doesn't match the search; r3 keeps its place (#3) in your ranking.
    expect(rankedRows()).toEqual(['Ranked oneYou: #1', 'Ranked threeYou: #3', 'PushedDown ranked']);
    // Already yours: no Rank, drag or Down rank, and a press opens it to watch.
    expect(screen.queryByRole('button', { name: /^Rank Ranked|^Rank Pushed/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Down rank (Ranked|Pushed)/ })).toBeNull();
    const row = screen.getAllByTestId('best-debates-to-rank-ranked-row')[0];
    expect(row.getAttribute('draggable')).toBeNull();
    fireEvent.click(screen.getByText('Ranked one'));
    expect(watch).toHaveBeenCalledWith('r1', 'row');

    // The unranked list (and its count) stays unranked-only.
    expect(screen.getAllByTestId('best-debates-to-rank-row')).toHaveLength(1);

    fireEvent.click(toggle);
    expect(toggle.textContent).toBe('Show ranked debates (3)');
    expect(rankedRows()).toEqual([]);
  });

  it('shows it after the empty line when nothing unranked is left or matches', () => {
    render(list({ debates: [], query: 'tariffs' }));
    expect(screen.getByText('You’re up to date.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show ranked debates (3)' })).toBeTruthy();
    cleanup();

    render(list({ query: 'tariffs prices' }));
    expect(screen.getByText('No debates match.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show ranked debates (1)' }));
    expect(rankedRows()).toEqual(['Ranked oneYou: #1']);
    cleanup();

    render(list({ debates: [], filtered: true }));
    expect(screen.getByText('Nothing left to rank with these filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show ranked debates (4)' }));
    expect(rankedRows()).toHaveLength(4);
  });

  it('is hidden when none of your ranked debates match', () => {
    render(list({ query: 'dating' }));
    expect(screen.queryByRole('button', { name: /ranked debates/ })).toBeNull();
    cleanup();
    render(list({ query: 'tariffs', rankedMatches: { ranked: [], downRanked: [], capped: false } }));
    expect(screen.queryByRole('button', { name: /ranked debates/ })).toBeNull();
  });

  it('follows the search, and your ranking as debates move in and out of it', () => {
    const { rerender } = render(list({ query: 'tariffs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show ranked debates (3)' }));

    rerender(list({ query: 'cats' }));
    expect(screen.getByRole('button', { name: 'Hide ranked debates (1)' })).toBeTruthy();
    expect(rankedRows()).toEqual(['Ranked twoYou: #2']);

    // d1 is dragged into your ranking at #1: it leaves the unranked list for the section, with its place.
    rerender(
      list({
        query: 'tariffs',
        debates: debates.filter(debate => debate.entityId !== 'd1'),
        rankedMatches: { ...matches, ranked: ['d1', ...matches.ranked] },
      })
    );
    expect(screen.queryAllByTestId('best-debates-to-rank-row')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Hide ranked debates (4)' })).toBeTruthy();
    expect(rankedRows()).toEqual(['NewestYou: #1', 'Ranked oneYou: #2', 'Ranked threeYou: #4', 'PushedDown ranked']);

    // The last debate left to rank goes in too: the section stays open.
    rerender(
      list({ query: 'tariffs', debates: [], rankedMatches: { ...matches, ranked: ['d2', 'd1', ...matches.ranked] } })
    );
    expect(screen.getByText('You’re up to date.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide ranked debates (4)' })).toBeTruthy();
    expect(rankedRows()[0]).toBe('NewestYou: #2');

    // Removed from your ranking: it leaves the section and is to rank again.
    rerender(list({ query: 'tariffs', rankedMatches: { ...matches, ranked: ['r3'] } }));
    expect(screen.getByRole('button', { name: 'Hide ranked debates (2)' })).toBeTruthy();
    expect(rankedRows()).toEqual(['Ranked threeYou: #1', 'PushedDown ranked']);
    expect(screen.getAllByTestId('best-debates-to-rank-row')).toHaveLength(1);
  });

  it('says when the filtered read stopped at its cap', () => {
    render(list({ filtered: true, rankedMatches: { ...matches, capped: true } }));
    fireEvent.click(screen.getByRole('button', { name: 'Show ranked debates (4)' }));
    expect(screen.getByText('Showing the first 1000.')).toBeTruthy();
  });
});

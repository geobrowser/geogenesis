import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RecentDebate } from '~/core/blocks/ranking/best-debates-debates';
import type { BestDebateRowData } from '~/core/blocks/ranking/use-best-debate-displays';
import type { RankersRead } from '~/core/blocks/ranking/use-best-debates-to-rank';

import { RANKING_ENTITY_DRAG_TYPE } from '../ranking-entity-drag';
import { BestDebateDisplaysContext } from './best-debate-row';
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
    const rows = screen.getAllByRole('button');
    expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(['Rank Newest', 'Rank Older']);
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

  it('places a debate on a press, and can be dragged', () => {
    const onPlace = vi.fn();
    renderList({ onPlace });
    const row = screen.getByRole('button', { name: 'Rank Newest' });
    fireEvent.click(row);
    expect(onPlace).toHaveBeenCalledWith('d1');

    const setData = vi.fn();
    fireEvent.dragStart(row, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(RANKING_ENTITY_DRAG_TYPE, 'd1');
  });

  it('pushes a debate down from its row without placing it', () => {
    const onPlace = vi.fn();
    const onPushDown = vi.fn();
    renderList({ onPlace, onPushDown });
    const button = screen.getByRole('button', { name: 'Push Newest down' });
    expect(button.getAttribute('title')).toBe('Push it down');
    fireEvent.click(button);
    expect(onPushDown).toHaveBeenCalledWith('d1');
    expect(onPlace).not.toHaveBeenCalled();
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
    expect(screen.getAllByRole('button').map(row => row.getAttribute('aria-label'))).toEqual(['Rank Newest']);
    cleanup();

    withDisplays({ topicIds: ['dating'] });
    expect(screen.getAllByRole('button').map(row => row.getAttribute('aria-label'))).toEqual(['Rank Older']);
    cleanup();

    withDisplays({ query: 'nothing like this' });
    expect(screen.getByText('No debates match.')).toBeTruthy();
    cleanup();

    withDisplays({ groupBySpace: true });
    expect(screen.getAllByTestId('space-group').map(group => group.getAttribute('aria-label'))).toEqual([
      'US Politics',
      'Relationships',
    ]);
  });
});

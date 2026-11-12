import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RecentDebate } from '~/core/blocks/ranking/best-debates-debates';
import type { RankersRead } from '~/core/blocks/ranking/use-best-debates-to-rank';

import { RANKING_ENTITY_DRAG_TYPE } from '../ranking-entity-drag';
import { BestDebatesToRankList } from './best-debates-to-rank-list';

vi.mock('../ranking-entry-row', () => ({
  RankingEntryRow: ({ entry }: { entry: { name: string } }) => <span>{entry.name}</span>,
}));

afterEach(cleanup);

const debates: RecentDebate[] = [
  { entityId: 'd1', name: 'Newest', createdAtMs: 2, spaceId: 's' },
  { entityId: 'd2', name: 'Older', createdAtMs: 1, spaceId: 's' },
];

function rankers(overrides: Partial<RankersRead> = {}): RankersRead {
  return {
    rankersOf: id => (id === 'd2' ? [{ name: 'Preston' } as never] : []),
    rankerCount: id => (id === 'd2' ? 1 : 0),
    isLoading: false,
    error: null,
    refetch: async () => undefined,
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
    renderList({ rankers: rankers({ isLoading: true }) });
    expect(screen.queryByText('Nobody has ranked this yet')).toBeNull();
    cleanup();
    renderList({ rankers: rankers({ error: new Error('down') }) });
    expect(screen.queryByText('Nobody has ranked this yet')).toBeNull();
    cleanup();
    renderList({ rankers: rankers({ status: 'loading', rankerCount: () => null }) });
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

  it('says so when nothing is left', () => {
    renderList({ debates: [] });
    expect(screen.getByText('You’re up to date.')).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RankingComposeGlobalRanking,
  type RankingComposeTeamMode,
  type RankingComposeTeamView,
} from './ranking-compose-global-ranking';
import { RankingComposeLayout, type RankingComposeMobileTab } from './ranking-compose-layout';

vi.mock('./ranking-entry-row', () => ({
  RankingEntryRow: ({ entry }: { entry: { name: string } }) => <span>{entry.name}</span>,
}));
vi.mock('~/core/blocks/ranking/use-vote-tab-entities', () => ({
  useVoteTabEntities: () => ({
    orderedIds: [],
    entries: [],
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: false,
    retry: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
}));

afterEach(cleanup);

const entries = new Map(
  ['a', 'b'].map(id => [id, { entityId: id, name: `Debate ${id}`, description: null, image: null }])
);

function Column({ teamView, onAdd = vi.fn() }: { teamView?: RankingComposeTeamView; onAdd?: (id: string) => void }) {
  return (
    <RankingComposeGlobalRanking
      isMobile={false}
      spaceId="s"
      orderedIds={[]}
      filteredRankedIds={['a', 'b']}
      filteredUnrankedIds={[]}
      globalRankByEntityId={
        new Map([
          ['a', 1],
          ['b', 2],
        ])
      }
      rankableEntriesById={entries}
      searchResultsById={new Map()}
      rowsByEntityId={new Map()}
      hasVisibleRankableEntities
      isSearchActive={false}
      isSearchSettled
      isDebouncingAfterEmptySearch={false}
      isLoadingRows={false}
      isFetchingNextPage={false}
      hasNextPage={false}
      hasAnyRankableEntityIds
      onFetchNextPage={vi.fn()}
      searchQuery=""
      onSearchQueryChange={vi.fn()}
      onAddToMyRanking={onAdd}
      onCreateNew={vi.fn()}
      canCreateNew={false}
      isAwaitingMembership={false}
      onRecheckMembership={vi.fn()}
      pendingEntityIds={new Set()}
      revealablePendingIds={[]}
      activeSwipeRowKey={null}
      onActiveSwipeRowKeyChange={vi.fn()}
      onViewEntity={vi.fn()}
      teamView={teamView}
      draggableRows={Boolean(teamView)}
    />
  );
}

function TeamColumn({ onAdd }: { onAdd: (id: string) => void }) {
  const [mode, setMode] = React.useState<RankingComposeTeamMode>('all');
  return (
    <Column
      onAdd={onAdd}
      teamView={{ mode, onModeChange: setMode, toRankCount: 4, toRankPanel: <p>to rank panel</p> }}
    />
  );
}

describe('the team column (Best debates)', () => {
  it('switches between All and To rank in place of the browse tabs', () => {
    const onAdd = vi.fn();
    render(<TeamColumn onAdd={onAdd} />);
    expect(screen.getByText('Team ranking')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Upvoted' })).toBeNull();

    const row = screen.getByRole('button', { name: 'Add Debate a to my ranking' });
    expect(row.getAttribute('draggable')).toBe('true');
    fireEvent.click(row);
    expect(onAdd).toHaveBeenCalledWith('a');

    fireEvent.click(screen.getByRole('button', { name: /To rank/ }));
    expect(screen.getByText('to rank panel')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByText('Debate a')).toBeNull();
  });

  it('leaves other blocks with their browse tabs and undraggable rows', () => {
    render(<Column />);
    expect(screen.getByRole('tab', { name: 'Global ranking' })).toBeTruthy();
    expect(screen.queryByText('Team ranking')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Debate a to my ranking' }).getAttribute('draggable')).toBeNull();
  });
});

describe('phone tabs', () => {
  function Phone() {
    const [active, setActive] = React.useState<RankingComposeMobileTab>('global');
    return (
      <RankingComposeLayout
        isMobile
        globalRanking={<p>team list</p>}
        myRanking={<p>your list</p>}
        mobileTabs={{ globalLabel: 'Team ranking', myLabel: 'Your ranking', active, onChange: setActive }}
      />
    );
  }

  it('shows one column at a time', () => {
    render(<Phone />);
    expect(screen.getByText('team list')).toBeTruthy();
    expect(screen.queryByText('your list')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Your ranking' }));
    expect(screen.getByText('your list')).toBeTruthy();
    expect(screen.queryByText('team list')).toBeNull();
  });

  it('still stacks both columns on other blocks', () => {
    render(<RankingComposeLayout isMobile globalRanking={<p>team list</p>} myRanking={<p>your list</p>} />);
    expect(screen.getByText('team list')).toBeTruthy();
    expect(screen.getByText('your list')).toBeTruthy();
  });
});

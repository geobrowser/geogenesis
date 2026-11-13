import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BestDebateDisplaysContext, BestDebateWatchContext } from './best-debates/best-debate-row';
import { RankButton } from './best-debates/best-debates-team-row';
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

function Column({
  teamView,
  onAdd = vi.fn(),
  isMobile = false,
  orderedIds = [],
}: {
  teamView?: RankingComposeTeamView;
  onAdd?: (id: string) => void;
  isMobile?: boolean;
  orderedIds?: string[];
}) {
  return (
    <RankingComposeGlobalRanking
      isMobile={isMobile}
      spaceId="s"
      orderedIds={orderedIds}
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
    // No visible heading on desktop; the column is named for screen readers.
    expect(screen.queryByText('Team ranking')).toBeNull();
    expect(screen.getByRole('region', { name: 'Team ranking' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Upvoted' })).toBeNull();

    const row = screen.getByRole('button', { name: 'Add Debate a to my ranking' });
    expect(row.getAttribute('draggable')).toBe('true');
    fireEvent.click(row);
    expect(onAdd).toHaveBeenCalledWith('a');

    fireEvent.click(screen.getByRole('button', { name: /To rank/ }));
    expect(screen.getByText('to rank panel')).toBeTruthy();
    // Search stays on To rank (Preston, 12 Nov): it filters the To rank list.
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(screen.queryByText('Debate a')).toBeNull();
  });

  it('groups the All list by space under By space, the middle option, keeping team order inside', () => {
    const display = (spaceId: string, name: string) => ({
      entityId: '',
      title: '',
      debaterSpaceIds: [],
      ownSpaceId: spaceId,
      createdAtMs: null,
      topics: [],
      keyframeUrl: null,
      debaters: null,
      space: { id: spaceId, name, image: null },
    });
    const displays = new Map([
      ['a', display('sp1', 'US Politics')],
      ['b', display('sp2', 'Relationships')],
    ]);
    render(
      <BestDebateDisplaysContext.Provider value={displays}>
        <TeamColumn onAdd={vi.fn()} />
      </BestDebateDisplaysContext.Provider>
    );

    const options = screen.getAllByRole('group', { name: 'Show' })[0].querySelectorAll('button');
    expect([...options].map(option => option.textContent)).toEqual(['All', 'By space', 'To rank4']);
    expect(screen.queryAllByTestId('space-group')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'By space' }));
    expect(screen.getAllByTestId('space-group').map(group => group.getAttribute('aria-label'))).toEqual([
      'US Politics',
      'Relationships',
    ]);
    expect(screen.getByRole('region', { name: 'Team ranking by space' })).toBeTruthy();
  });

  it('leaves other blocks with their browse tabs and undraggable rows', () => {
    render(<Column />);
    expect(screen.getByRole('tab', { name: 'Global ranking' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Team ranking' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Debate a to my ranking' }).getAttribute('draggable')).toBeNull();
  });
});

describe('Best debates rows (Preston, 13 Nov)', () => {
  // The row both lists draw: the claim, then a Rank button unless it's already in your ranking.
  const teamView = (onRank: (id: string) => void): RankingComposeTeamView => ({
    mode: 'all',
    onModeChange: vi.fn(),
    toRankCount: 0,
    toRankPanel: null,
    renderRow: ({ entityId, name, isInMyRanking }) => (
      <span>
        {name}
        {isInMyRanking ? null : <RankButton name={name} onClick={() => onRank(entityId)} />}
      </span>
    ),
  });

  const renderRows = ({ isMobile = false, orderedIds = [] as string[] } = {}) => {
    const watch = vi.fn();
    const onRank = vi.fn();
    const onAdd = vi.fn();
    render(
      <BestDebateWatchContext.Provider value={watch}>
        <Column isMobile={isMobile} orderedIds={orderedIds} onAdd={onAdd} teamView={teamView(onRank)} />
      </BestDebateWatchContext.Provider>
    );
    return { watch, onRank, onAdd };
  };

  it.each([
    ['on a desktop', false],
    ['on a phone', true],
  ])('opens a debate to watch from its row and ranks it only from Rank, %s', (_label, isMobile) => {
    const { watch, onRank, onAdd } = renderRows({ isMobile });

    fireEvent.click(screen.getByText('Debate a'));
    expect(watch).toHaveBeenCalledWith('a');
    expect(onRank).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Rank Debate a' }));
    expect(onRank).toHaveBeenCalledWith('a');
    expect(watch).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('keeps the row out of the accessibility tree as a button, so Rank stays reachable', () => {
    renderRows();
    expect(screen.queryByRole('button', { name: /Add Debate a/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Watch Debate a/ })).toBeNull();
    const row = screen.getAllByTestId('best-debates-pick-row')[0];
    expect(row.getAttribute('role')).toBeNull();
    expect(row.getAttribute('draggable')).toBe('true');
  });

  it('opens a debate already in your ranking to watch too, with no Rank button', () => {
    const { watch, onAdd } = renderRows({ orderedIds: ['b'] });
    expect(screen.queryByRole('button', { name: 'Rank Debate b' })).toBeNull();
    fireEvent.click(screen.getByText('Debate b'));
    expect(watch).toHaveBeenCalledWith('b');
    expect(onAdd).not.toHaveBeenCalled();
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

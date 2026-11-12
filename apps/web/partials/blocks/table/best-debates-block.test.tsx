import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PeriodDebate, addDays, nyDayStartMs } from '~/core/blocks/ranking/best-debates-views';
import type { BestDebatesRankers } from '~/core/blocks/ranking/use-best-debates';

import { BestDebatesBlock, type BestDebatesBlockProps } from './best-debates-block';

const TODAY = '2026-11-11';
const SPACE = '9284477c8fe746368698994e2e517b32';
const BLOCK = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0';
const noon = (key: string) => nyDayStartMs(key) + 12 * 3_600_000;

const mocks = vi.hoisted(() => ({
  flag: false,
  canEdit: false,
  rankers: null as unknown as BestDebatesRankers,
  window: [] as PeriodDebate[],
  windowLoading: false,
  capture: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/blocks/ranking/use-best-debates', () => ({
  useNyTodayKey: () => TODAY,
  useBestDebatesRankers: () => mocks.rankers,
  useBestDebatesWindow: ({ enabled = true }: { enabled?: boolean }) => ({
    data: enabled && !mocks.windowLoading ? mocks.window : undefined,
    isLoading: enabled && mocks.windowLoading,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: [], isLoading: false }),
}));
vi.mock('./ranking-entry-row', () => ({
  RankingEntryRow: ({
    rank,
    entry,
    actions,
  }: {
    rank?: number;
    entry: { name: string };
    actions?: React.ReactNode;
  }) => (
    <div>
      <span data-testid="place">{rank ?? '-'}</span>
      <span data-testid="name">{entry.name}</span>
      {actions}
    </div>
  ),
  RankingEntryRowSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock('./ranking-block-ui', () => ({
  RankingGlobalDesktopRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function rankersReady(counts: Record<string, number>): BestDebatesRankers {
  return { status: 'ready', rankerCount: id => counts[id] ?? 0, retry: vi.fn() };
}

function renderBlock(props: Partial<BestDebatesBlockProps> = {}) {
  const onOpenCompose = vi.fn();
  render(
    <BestDebatesBlock
      blockId={BLOCK}
      spaceId={SPACE}
      teamOrder={['old', 'b', 'yday', 'a']}
      // The block state's canComposeEdit: the flag and membership (tested in its own suite).
      canRank={mocks.flag && mocks.canEdit}
      isMobile={false}
      onOpenCompose={onOpenCompose}
      onOpenEntity={vi.fn()}
      {...props}
    />
  );
  return { onOpenCompose };
}

const names = () => screen.queryAllByTestId('name').map(node => node.textContent);

beforeEach(() => {
  mocks.flag = false;
  mocks.canEdit = false;
  mocks.windowLoading = false;
  mocks.capture.mockReset();
  mocks.window = [
    { id: 'u1', name: 'Unranked one', createdAtMs: noon(TODAY) },
    { id: 'a', name: 'Debate A', createdAtMs: noon(TODAY) },
    { id: 'yday', name: 'Yesterday debate', createdAtMs: noon(addDays(TODAY, -1)) },
    { id: 'u2', name: 'Unranked two', createdAtMs: noon(TODAY) },
    { id: 'b', name: 'Debate B', createdAtMs: noon(TODAY) },
  ];
  mocks.rankers = rankersReady({ old: 3, b: 2, yday: 1, a: 1 });
});

afterEach(cleanup);

describe('BestDebatesBlock', () => {
  it("shows today's team order, then today's unranked debates in Best order", () => {
    renderBlock();

    expect(names()).toEqual(['Debate B', 'Debate A', 'Unranked one', 'Unranked two']);
    expect(screen.getAllByTestId('place').map(node => node.textContent)).toEqual(['2', '4', '-', '-']);
    expect(screen.getByText(/Not ranked yet · 2/)).toBeInTheDocument();
  });

  it('shows the coverage line and each row’s ranker count', () => {
    renderBlock();

    expect(screen.getByTestId('best-debates-coverage')).toHaveTextContent('2 of 4 debates from today are ranked');
    expect(screen.getAllByTestId('best-debates-ranker-count').map(node => node.textContent)).toEqual([
      '2 rankers',
      '1 ranker',
    ]);
  });

  it('labels the last seven days with their coverage', () => {
    renderBlock();

    const strip = screen.getByRole('group', { name: 'Last 7 days' });
    const days = within(strip).getAllByRole('button');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent('Today2 of 4 ranked');
    expect(days[1]).toHaveTextContent('Yesterday1 of 1 ranked');
    expect(days[2]).toHaveTextContent('No debates');
    expect(within(strip).getByLabelText('Pick an earlier day')).toHaveAttribute('max', TODAY);
  });

  it('keeps the same order in This week and All time, and leaves unranked debates out of All time', () => {
    renderBlock();

    fireEvent.click(screen.getByRole('radio', { name: 'This week' }));
    expect(names()).toEqual(['Debate B', 'Yesterday debate', 'Debate A', 'Unranked one', 'Unranked two']);
    expect(mocks.capture).toHaveBeenCalledWith(
      'element_changed',
      expect.objectContaining({ source: 'best_debates_block', element: 'period', value: 'week', previous_value: 'day' })
    );

    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    // "old" has no name in the window read, so it renders as a skeleton until its entity resolves.
    expect(names()).toEqual(['Debate B', 'Yesterday debate', 'Debate A']);
    expect(screen.queryByText(/Not ranked yet/)).not.toBeInTheDocument();
  });

  it('shows no Rank or Rank the rest with the flag off, even for a member', () => {
    mocks.canEdit = true;
    renderBlock();

    expect(screen.queryByRole('button', { name: 'Rank' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rank the rest' })).not.toBeInTheDocument();
    // The team order is still there.
    expect(names()).toContain('Debate B');
  });

  it('shows no Rank or Rank the rest to a non-member with the flag on', () => {
    mocks.flag = true;
    renderBlock();

    expect(screen.queryByRole('button', { name: 'Rank' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rank the rest' })).not.toBeInTheDocument();
  });

  it('opens the ranking screen on To rank from Rank the rest, for a member with the flag on', () => {
    mocks.flag = true;
    mocks.canEdit = true;
    const { onOpenCompose } = renderBlock();

    fireEvent.click(screen.getByRole('button', { name: 'Rank the rest' }));
    expect(onOpenCompose).toHaveBeenCalledWith('edit', { team: 'to-rank' });
    expect(mocks.capture).toHaveBeenCalledWith(
      'element_clicked',
      expect.objectContaining({ source: 'best_debates_block', element_action: 'rank_the_rest', unranked_count: 2 })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rank' }));
    expect(onOpenCompose).toHaveBeenLastCalledWith('edit');
  });

  it('never says "Not ranked yet" or shows counts off a failed ballot read', () => {
    mocks.rankers = { status: 'error', rankerCount: () => null, retry: vi.fn() };
    renderBlock();

    expect(screen.queryByText(/Not ranked yet/)).not.toBeInTheDocument();
    expect(screen.getByText(/Not in the team ranking yet · 2/)).toBeInTheDocument();
    expect(screen.queryByTestId('best-debates-ranker-count')).not.toBeInTheDocument();
    expect(screen.getByTestId('best-debates-coverage')).toHaveTextContent('Couldn’t check who ranked');
    // The strip falls back to plain totals.
    expect(within(screen.getByRole('group', { name: 'Last 7 days' })).getAllByRole('button')[0]).toHaveTextContent(
      'Today4 debates'
    );
  });

  it('shows skeletons, not "Nobody has ranked", while the ballot read is loading', () => {
    mocks.rankers = { status: 'loading', rankerCount: () => null, retry: vi.fn() };
    renderBlock({ teamOrder: [] });

    expect(screen.queryByTestId('best-debates-coverage')).not.toBeInTheDocument();
    expect(screen.queryByText(/Not ranked yet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nobody has ranked/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('shows All time from the team order without waiting for the ballot read', () => {
    mocks.rankers = { status: 'loading', rankerCount: () => null, retry: vi.fn() };
    renderBlock();

    // Day waits for the ballot read…
    expect(screen.queryAllByTestId('name')).toHaveLength(0);
    // …All time doesn't, and its counts fill in later.
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    expect(names()).toEqual(['Debate B', 'Yesterday debate', 'Debate A']);
    expect(screen.queryByTestId('best-debates-ranker-count')).not.toBeInTheDocument();
  });

  it('shows skeletons, not "Nobody has ranked", while the team order is loading', () => {
    renderBlock({ teamOrder: [], isLoadingTeamOrder: true });

    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    expect(screen.queryByText(/Nobody has ranked/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('offers Retry, not "Nobody has ranked", when the ballot read failed and nothing is placed', () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    mocks.rankers = { status: 'error', rankerCount: () => null, retry };
    renderBlock({ teamOrder: [] });

    expect(screen.queryByText(/Nobody has ranked/)).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('best-debates-rankers-error')).getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });

  it('picks an earlier day from the calendar', () => {
    renderBlock();

    fireEvent.change(screen.getByLabelText('Pick an earlier day'), { target: { value: '2026-10-01' } });
    // The older day is read separately; the mock returns the same window, none of it from that day.
    expect(screen.getByText('No debates were published on this day.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Picked day/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

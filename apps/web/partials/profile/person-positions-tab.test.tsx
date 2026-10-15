import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type * as React from 'react';

import { Effect } from 'effect';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { personPositionOrderQueryKey } from '~/core/profile/person-position-order';
import type { PositionIndexEntry } from '~/core/profile/use-person-position-index';

import { PersonPositionsTab } from './person-positions-tab';
import type { RecordFilterDimension } from './record-filter-row';
import { profileHideMyPositionsAtom } from '~/atoms';

const PROFILE = '11111111111111111111111111111111';
const VIEWER = '22222222222222222222222222222222';
const OTHER_VIEWER = '33333333333333333333333333333333';
const CLAIMS = Array.from({ length: 25 }, (_, i) => `claim${i}`);
const mocks = vi.hoisted(() => ({
  personalSpaceId: '22222222222222222222222222222222' as string | null,
  isLoadingIdentity: false,
  graphql: vi.fn(),
  rows: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isLoading: mocks.isLoadingIdentity }),
}));
vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map() }),
  spaceLabel: () => ({ name: 'Person' }),
}));
vi.mock('~/core/io/graphql-client', () => ({ graphql: (...args: unknown[]) => mocks.graphql(...args) }));
vi.mock('~/core/profile/explore-rows-by-ids', () => ({
  fetchExploreRowsByIds: (...args: unknown[]) => mocks.rows(...args),
}));
// Exercise the real index, order intersection, pagination and switch; replace the cards and menus.
vi.mock('./record-filter-row', () => ({
  RecordFilterRow: ({
    end,
    dimensions,
    sort,
  }: {
    end: React.ReactNode;
    dimensions: RecordFilterDimension[];
    sort: { onChange: (value: string) => void };
  }) => (
    <div>
      <button onClick={() => sort.onChange('top')}>Top</button>
      {dimensions.flatMap(dimension =>
        dimension.options.map(option => (
          <button
            key={`${dimension.key}-${option.value}`}
            aria-pressed={dimension.values.includes(option.value)}
            onClick={() => dimension.onToggle(option.value)}
          >
            {dimension.key}: {option.value} ({option.count})
          </button>
        ))
      )}
      {end}
    </div>
  ),
}));
vi.mock('./person-record-feed', () => ({
  PersonRecordFeed: ({
    rows,
    isLoading,
    isError,
    emptyLabel,
    hasNextPage,
    fetchNextPage,
    onRetry,
  }: {
    rows: { entityId: string }[];
    isLoading: boolean;
    isError: boolean;
    emptyLabel: string;
    hasNextPage: boolean;
    fetchNextPage: () => void;
    onRetry?: () => void;
  }) => (
    <div>
      {isLoading ? (
        <p>Loading positions</p>
      ) : isError ? (
        <p>Could not load positions</p>
      ) : rows.length ? (
        <div data-testid="feed">
          {rows.map(row => (
            <p key={row.entityId}>{row.entityId}</p>
          ))}
        </div>
      ) : (
        <p>{emptyLabel}</p>
      )}
      {hasNextPage && <button onClick={fetchNextPage}>More</button>}
      {isError && onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
}));

const entries: PositionIndexEntry[] = CLAIMS.map((entityId, i) => ({
  entityId,
  spaceIds: [i % 2 === 0 ? 'spacea' : 'spaceb'],
  topicIds: ['topic'],
  topicsBySpace: new Map([[i % 2 === 0 ? 'spacea' : 'spaceb', new Set(['topic'])]]),
}));

function page(selected: PositionIndexEntry[]) {
  return { entries: selected, names: new Map([['topic', 'Topic']]), hasNextPage: false, endCursor: null };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.personalSpaceId = VIEWER;
  mocks.isLoadingIdentity = false;
  mocks.graphql.mockImplementation(({ variables }) =>
    Effect.succeed(page(variables.filter ? entries.slice(20) : entries))
  );
  mocks.rows.mockImplementation(async (ids: string[]) => ids.map(entityId => ({ entityId, spaceId: 'spacea' })));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(hidden = false) {
  const store = createStore();
  store.set(profileHideMyPositionsAtom, hidden);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  for (const sort of ['new', 'top'] as const) {
    client.setQueryData(personPositionOrderQueryKey(PROFILE, sort), {
      entityIds: sort === 'top' ? [...CLAIMS].reverse() : CLAIMS,
      responseByClaimId: {},
      spacesByClaimId: {},
    });
  }
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Provider>
  );
  return render(<PersonPositionsTab spaceId={PROFILE} />, { wrapper });
}

const toggle = () => screen.getByRole('switch', { name: 'Hide my positions' });
const feedClaims = () => [...screen.getByTestId('feed').children].map(node => node.textContent);

describe('profile Hide my positions', () => {
  it('starts off, filters beyond the first page, and restores the full record', async () => {
    setup();
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(0, 20)));
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(toggle()).toHaveAttribute('data-geo-analytics-label', 'Profile positions Hide my positions');
    expect(toggle()).toHaveAttribute('data-geo-analytics-intent', 'filter_profile_positions');
    fireEvent.click(toggle());
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(20)));
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(mocks.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          userId: PROFILE,
          filter: { not: { votedBy: { userId: VIEWER, kinds: [1], types: [0, 1] } } },
        }),
      })
    );
    expect(window.localStorage.getItem('profileHideMyPositions')).toBe('true');
    fireEvent.click(toggle());
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(0, 20)));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS));
  });

  it('combines the exclusion with space/topic filters and preserves sort order', async () => {
    setup(true);
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(20)));
    fireEvent.click(screen.getByRole('button', { name: 'spaces: spacea (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'topics: topic (3)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Top' }));
    await waitFor(() => expect(feedClaims()).toEqual(['claim24', 'claim22', 'claim20']));
  });

  it.each([null, PROFILE, '11111111-1111-1111-1111-111111111111'])(
    'does not hide positions for viewer %s',
    async viewer => {
      mocks.personalSpaceId = viewer;
      setup(true);
      await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(0, 20)));
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(mocks.graphql.mock.calls.every(([args]) => args.variables.filter === null)).toBe(true);
    }
  );

  it('keeps the full record out of view while the filtered index loads', async () => {
    mocks.graphql.mockReturnValue(Effect.never);
    setup(true);
    expect(screen.getByText('Loading positions')).toBeInTheDocument();
    await act(async () => {});
    expect(mocks.rows.mock.calls.every(([ids]) => ids.length === 0)).toBe(true);
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
  });

  it('waits for the viewer identity when the saved preference is on', async () => {
    mocks.personalSpaceId = null;
    mocks.isLoadingIdentity = true;
    const { rerender } = setup(true);
    await act(async () => {});
    expect(screen.getByText('Loading positions')).toBeInTheDocument();
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
    mocks.personalSpaceId = VIEWER;
    mocks.isLoadingIdentity = false;
    rerender(<PersonPositionsTab spaceId={PROFILE} />);
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(20)));
  });

  it('reports an exclusion failure and lets the viewer turn the filter off', async () => {
    mocks.graphql.mockImplementation(({ variables }) =>
      variables.filter ? Effect.fail(new Error('index unavailable')) : Effect.succeed(page(entries))
    );
    setup(true);
    await screen.findByText('Could not load positions');
    expect(screen.queryByTestId('feed')).not.toBeInTheDocument();
    fireEvent.click(toggle());
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(0, 20)));
  });

  it('explains an empty filtered record and keeps the toggle available', async () => {
    mocks.graphql.mockReturnValue(Effect.succeed(page([])));
    setup(true);
    await screen.findByText(/Turn off “Hide my positions”/);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
  });

  it('preserves selected topics when enabling the exclusion fails', async () => {
    mocks.graphql.mockImplementation(({ variables }) =>
      variables.filter ? Effect.fail(new Error('index unavailable')) : Effect.succeed(page(entries))
    );
    setup();
    const topic = await screen.findByRole('button', { name: 'topics: topic (25)' });
    fireEvent.click(topic);
    expect(topic).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle());
    await screen.findByText('Could not load positions');
    fireEvent.click(toggle());
    expect(await screen.findByRole('button', { name: 'topics: topic (25)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('retries the failed exclusion query and restores the filtered record', async () => {
    mocks.graphql.mockReturnValue(Effect.fail(new Error('index unavailable')));
    setup(true);
    await screen.findByText('Could not load positions');
    mocks.graphql.mockReturnValue(Effect.succeed(page(entries.slice(20))));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(20)));
  });

  it('refreshes the exclusion when it is enabled again after the viewer answers more claims', async () => {
    setup(true);
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(20)));
    fireEvent.click(toggle());
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(0, 20)));
    mocks.graphql.mockReturnValue(Effect.succeed(page(entries.slice(23))));
    fireEvent.click(toggle());
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(23)));
  });

  it('does not reuse another viewer’s filtered index after switching accounts', async () => {
    mocks.graphql.mockImplementation(({ variables }) =>
      Effect.succeed(page(variables.filter?.not.votedBy.userId === VIEWER ? entries.slice(20) : entries.slice(0, 2)))
    );
    const { rerender } = setup(true);
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(20)));
    mocks.personalSpaceId = OTHER_VIEWER;
    rerender(<PersonPositionsTab spaceId={PROFILE} />);
    await waitFor(() => expect(feedClaims()).toEqual(CLAIMS.slice(0, 2)));
  });
});

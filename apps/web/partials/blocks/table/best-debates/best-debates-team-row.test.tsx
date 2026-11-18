import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BestDebateRowData } from '~/core/blocks/ranking/use-best-debate-displays';
import type { RankersRead } from '~/core/blocks/ranking/use-best-debates-to-rank';

import { BestDebateDisplaysContext, BestDebateWatchContext } from './best-debate-row';
import { BestDebatesTeamRowContent } from './best-debates-team-row';

// The row's own reads (who ranked it) go through GraphQL; nothing here depends on them.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const display: BestDebateRowData = {
  entityId: 'd1',
  title: 'Voter ID should be required',
  debaterSpaceIds: [],
  ownSpaceId: 'sp1',
  createdAtMs: null,
  topics: [],
  keyframeUrl: null,
  debaters: null,
  space: { id: 'sp1', name: 'US Politics', image: null },
};

const rankers: RankersRead = {
  status: 'ready',
  rankersOf: () => [],
  rankerCount: () => 0,
  invalidate: async () => undefined,
};

function renderRow(props: Partial<React.ComponentProps<typeof BestDebatesTeamRowContent>> = {}) {
  const watch = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BestDebateDisplaysContext.Provider value={new Map([['d1', display]])}>
        <BestDebateWatchContext.Provider value={watch}>
          <BestDebatesTeamRowContent
            entityId="d1"
            name="Voter ID should be required"
            spaceId="sp1"
            rankers={rankers}
            myRank={null}
            draggable={false}
            {...props}
          />
        </BestDebateWatchContext.Provider>
      </BestDebateDisplaysContext.Provider>
    </QueryClientProvider>
  );
  return { watch };
}

// The real row (Preston, 13 Nov): rows on the ranking screen are only click targets, so these
// controls are the whole keyboard and screen-reader surface of a row.
describe('the Best debates team row', () => {
  it('has a Rank button that ranks, and a poster that watches from the keyboard', () => {
    const onRank = vi.fn();
    const { watch } = renderRow({ onRank });

    fireEvent.click(screen.getByRole('button', { name: 'Rank Voter ID should be required' }));
    expect(onRank).toHaveBeenCalledTimes(1);
    expect(watch).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Watch Voter ID should be required' }), { key: 'Enter' });
    expect(watch).toHaveBeenCalledWith('d1', 'poster');
    expect(onRank).toHaveBeenCalledTimes(1);
  });

  it('shows your place instead of Rank once the debate is in your ranking', () => {
    renderRow({ onRank: vi.fn(), myRank: 4 });
    expect(screen.queryByRole('button', { name: /^Rank / })).toBeNull();
    expect(screen.getByText('You: #4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Watch Voter ID should be required' })).toBeTruthy();
  });

  it('has no Rank button without a way to rank', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: /^Rank / })).toBeNull();
  });
});

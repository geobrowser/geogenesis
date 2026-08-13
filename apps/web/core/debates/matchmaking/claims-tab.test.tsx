import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingClaim } from '../api';
import { ClaimsTab } from './claims-tab';

const mocks = vi.hoisted(() => ({
  claims: [] as MatchmakingClaim[],
  lastQuery: null as unknown,
}));

vi.mock('./hooks', () => ({
  useMatchmakingClaims: (query: unknown) => {
    mocks.lastQuery = query;
    return {
      data: { pages: [{ claims: mocks.claims, next_cursor: null, facets: { space_ids: [] } }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  },
  useClaimReadiness: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({ submitResponse: vi.fn(), isConnected: true, personalSpaceId: 'personal-space' }),
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [] }),
}));

const SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c566';

function claim(entityId: string, text: string, viewerResponded: boolean, debateReady = false): MatchmakingClaim {
  return {
    claim: { id: `row-${entityId}`, space_id: SPACE_ID, claim_entity_id: entityId, claim: text, description: null },
    topics: [],
    response_kind: 'stance',
    viewer_position: viewerResponded ? true : null,
    viewer_response: viewerResponded ? { position: true, position_label: 'Agree' } : null,
    viewer_debate_ready: debateReady,
    readiness_disabled_reason: null,
    positions: [],
    score: 0,
    active_debate: false,
  };
}

const MINE = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';
const THEIRS = '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520';

beforeEach(() => {
  mocks.claims = [
    claim(MINE, 'Chips are better than fries', true),
    claim(THEIRS, 'Bitcoin will never top $250K', false),
  ];

  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('ClaimsTab', () => {
  // The claims you've taken a side on are the ones that can turn into debates, so they lead.
  it('leads with the claims the viewer has a position on', () => {
    render(<ClaimsTab />);

    const mine = screen.getByRole('heading', { name: 'My positions' });
    const all = screen.getByRole('heading', { name: 'All claims' });
    expect(mine.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const first = screen.getByText('Chips are better than fries');
    const second = screen.getByText('Bitcoin will never top $250K');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // With nothing to separate them from, a heading over the whole list says nothing.
  it('drops the headings when every claim falls on one side of the split', () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false)];
    render(<ClaimsTab />);

    expect(screen.queryByRole('heading', { name: 'My positions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All claims' })).not.toBeInTheDocument();
    expect(screen.getByText('Bitcoin will never top $250K')).toBeInTheDocument();
  });

  // "My positions" means every claim the viewer holds a response for, whether or not they are
  // currently open to debating it — the toggle is a separate answer to a separate question. The
  // reported bug drops the toggled-off ones, and it is geo-chat's join to fix; this pins the client
  // half, so nobody closes the gap here by filtering the list a second time on the way in.
  it('keeps positions the viewer is not currently open to debating', () => {
    const OFF = '019fedb3-2e63-7b50-9c33-4e9f7a0d6631';
    mocks.claims = [
      claim(MINE, 'Chips are better than fries', true, true),
      claim(OFF, 'Rust belongs in the kernel', true, false),
    ];
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /All claims/ }));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(mocks.lastQuery).toMatchObject({ filter: 'mine' });
    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
    expect(screen.getByText('Rust belongs in the kernel')).toBeInTheDocument();
  });

  it('drops the split once a filter already narrows to one group', () => {
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /All claims/ }));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(screen.queryByRole('heading', { name: 'My positions' })).not.toBeInTheDocument();
    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });
});

// Search, the space filter and the position filter all run server-side, so what this tab puts in
// the query is the whole feature — a mock that ignores it cannot catch a dropped filter.
it('asks the server for the filter the viewer picked', () => {
  render(<ClaimsTab />);

  expect(mocks.lastQuery).toMatchObject({ filter: 'all', spaceId: null });

  fireEvent.click(screen.getByRole('button', { name: 'All claims' }));
  fireEvent.click(screen.getByRole('button', { name: 'Debate now' }));

  expect(mocks.lastQuery).toMatchObject({ filter: 'debate_now' });
});

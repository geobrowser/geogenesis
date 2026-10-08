import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchClaim, DebateRematchSession } from './api';
import type { RematchPanelContext } from './rematch-panel-context';

const mocks = vi.hoisted(() => ({
  pathname: '/debate/room-1',
  data: { claims: [] as DebateRematchClaim[], excluded_claim_ids: [] as string[] },
  indexing: { status: 'idle', pending: undefined as undefined | { expectedResponse: 'positive' | 'negative' | null } },
  matchmaking: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('./hooks', () => ({ useDebateRematchClaims: () => ({ data: mocks.data }) }));
vi.mock('~/core/hooks/use-entity-vote', () => ({ useEntityResponseIndexingSnapshot: () => mocks.indexing }));
vi.mock('~/core/claims/browse/use-claim-matchup', () => ({ useClaimMatchup: mocks.matchmaking }));

const { ClaimEndSlot } = await import('~/core/claims/browse/claim-end-slot');
const { useRegisterRematchPanelContext } = await import('./rematch-panel-context');
let context: RematchPanelContext;
function Picker() {
  useRegisterRematchPanelContext(context);
  return null;
}
function View({ picker = true }: { picker?: boolean }) {
  return (
    <Provider>
      {picker && <Picker />}
      <ClaimEndSlot claimId="claim-1" spaceId="space-1" viewerPosition={true} variant="block" />
    </Provider>
  );
}
beforeEach(() => {
  mocks.pathname = '/debate/room-1';
  mocks.indexing = { status: 'idle', pending: undefined };
  mocks.matchmaking.mockReset().mockReturnValue({ match: null });
  mocks.data = {
    claims: [
      {
        claim: { claim_entity_id: 'claim-1', space_id: 'space-1' },
        viewer_position: true,
        participants: [{ user_id: 'opponent', position: false }],
        recently_rejected: false,
      } as DebateRematchClaim,
    ],
    excluded_claim_ids: [],
  };
  context = {
    sessionId: 'session-1',
    session: {
      id: 'session-1',
      status: 'browsing',
      participants: [{ user_id: 'viewer' }, { user_id: 'opponent' }],
      recently_rejected_claim_ids: [],
      request: null,
    } as unknown as DebateRematchSession,
    currentUserId: 'viewer',
    opponentPresent: true,
    canPublishDebateIn: () => true,
    createRequest: { mutate: vi.fn(), isPending: false, error: null, variables: undefined },
  };
});
afterEach(cleanup);

describe('claim side panel in a debate-again session', () => {
  it('requests the claim through the current session from a sibling panel', () => {
    render(<View />);
    mocks.matchmaking.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));
    expect(context.createRequest.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ source_space_id: 'space-1', claim_id: 'claim-1' })
    );
    expect(mocks.matchmaking).not.toHaveBeenCalled();
  });
  it('does not offer a different opponent when the room opponent agrees', () => {
    mocks.data.claims[0]!.participants[0]!.position = true;
    render(<View />);
    expect(screen.queryByRole('button', { name: 'Request debate' })).toBeNull();
  });
  it('waits for the opponent to arrive and updates when they do', () => {
    context.opponentPresent = false;
    const view = render(<View />);
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
    context = { ...context, opponentPresent: true };
    view.rerender(<View />);
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeEnabled();
  });
  it('waits for a changed position to be confirmed by the session', () => {
    mocks.data.claims[0]!.viewer_position = false;
    mocks.indexing.pending = { expectedResponse: 'positive' };
    render(<View />);
    expect(screen.getByRole('button', { name: 'Publishing your position…' })).toBeDisabled();
  });
  it.each(['deciding', 'ended', 'expired', 'converted'] as const)('removes the offer for a %s session', status => {
    context.session!.status = status;
    render(<View />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('does not request a claim in a different space', () => {
    mocks.data.claims[0]!.claim.space_id = 'another-space';
    render(<View />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('respects exclusions and recently rejected claims', () => {
    context.session!.recently_rejected_claim_ids = ['claim-1'];
    const view = render(<View />);
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
    mocks.data.excluded_claim_ids = ['claim-1'];
    view.rerender(<View />);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('shares pending requests and reports failures on the originating claim', () => {
    context.createRequest.isPending = true;
    context.createRequest.variables = { source_space_id: 'space-1', claim_id: 'claim-1', format_id: 'format' };
    const view = render(<View />);
    expect(screen.getByRole('button', { name: 'Requesting…' })).toBeDisabled();
    context = {
      ...context,
      createRequest: { ...context.createRequest, isPending: false, error: new Error('Request failed') },
    };
    view.rerender(<View />);
    expect(screen.getByRole('alert')).toHaveTextContent('Request failed');
  });
  it('does not show a request error from the same claim in another space', () => {
    context.createRequest.error = new Error('Wrong space request');
    context.createRequest.variables = { source_space_id: 'another-space', claim_id: 'claim-1', format_id: 'format' };
    render(<View />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeEnabled();
  });

  it('clears the session when the picker unmounts', () => {
    const view = render(<View />);
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeEnabled();
    view.rerender(<View picker={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(mocks.matchmaking).toHaveBeenCalled();
  });
  it('disables requests while the pair has a request pending on another claim', () => {
    context.session!.status = 'request_pending';
    render(<View />);
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
  });

  it('does not offer claims that cannot be published in this space', () => {
    context.canPublishDebateIn = () => false;
    render(<View />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not guess an opponent before the viewer is identified', () => {
    context.currentUserId = null;
    render(<View />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses the replacement session when the room rejoins', () => {
    const view = render(<View />);
    const mutate = vi.fn();
    context = {
      ...context,
      sessionId: 'session-2',
      session: { ...context.session!, id: 'session-2' },
      createRequest: { ...context.createRequest, mutate },
    };
    view.rerender(<View />);
    fireEvent.click(screen.getByRole('button', { name: 'Request debate' }));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it('keeps ordinary matchmaking outside a debate-again session', () => {
    render(<View picker={false} />);
    expect(mocks.matchmaking).toHaveBeenCalledWith(expect.objectContaining({ claimId: 'claim-1' }));
  });
});

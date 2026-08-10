import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { Entity } from '~/core/types';

import type { DebateClaim } from './api';
import { ClaimDebateButton } from './claim-debate-button';

const mocks = vi.hoisted(() => ({
  debatesEnabled: vi.fn(),
  debateClaims: vi.fn(),
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
  matchmakingSupported: vi.fn(),
  setIntentMutate: vi.fn(),
  clearIntentMutate: vi.fn(),
  openHub: vi.fn(),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useDebatesEnabled: () => mocks.debatesEnabled(),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: undefined }),
}));

vi.mock('./hooks', () => ({
  useDebateClaims: () => mocks.debateClaims(),
  useDebateActivity: () => ({ data: null }),
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutate: mocks.leaveMutate, isPending: false, error: null }),
}));

vi.mock('./debate-gateway', () => ({
  useDebateMatchmakingSupported: () => mocks.matchmakingSupported(),
}));

vi.mock('./matchmaking/hooks', () => ({
  useSetDebateIntent: () => ({ mutate: mocks.setIntentMutate, isPending: false, error: null }),
  useClearDebateIntent: () => ({ mutate: mocks.clearIntentMutate, isPending: false, error: null }),
}));

vi.mock('./matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({ open: mocks.openHub }),
}));

beforeEach(() => {
  mocks.debatesEnabled.mockReturnValue(true);
  mocks.debateClaims.mockReturnValue({ data: { claims: [] } });
  mocks.joinMutate.mockReset();
  mocks.leaveMutate.mockReset();
  mocks.matchmakingSupported.mockReturnValue(false);
  mocks.setIntentMutate.mockReset();
  mocks.clearIntentMutate.mockReset();
  mocks.openHub.mockReset();
});

afterEach(() => {
  cleanup();
});

const UNPUBLISHED = [{ isLocal: true, hasBeenPublished: false }] as unknown as Entity['relations'];

function entity(relations: Entity['relations'], types: { id: string }[] = [{ id: CLAIM_TYPE_ID }]): Entity {
  return { id: 'claim-entity-1', types, relations } as unknown as Entity;
}

function debateClaim(overrides: Partial<DebateClaim> = {}): DebateClaim {
  return {
    claim_entity_id: 'claim-entity-1',
    online_choices: [],
    viewer_waiting_position: null,
    active_match: null,
    active_debate: null,
    ...overrides,
  } as unknown as DebateClaim;
}

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: 'Debate' }));
}

describe('ClaimDebateButton', () => {
  it('renders nothing when the entity is not a Claim', () => {
    render(
      <ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([], [{ id: 'not-a-claim' }])} />
    );

    expect(screen.queryByRole('button', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('prompts to publish and disables the positions for an unpublished claim', () => {
    render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity(UNPUBLISHED)} />);
    openPopover();

    expect(screen.getByText('Publish this claim before starting a debate.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Yes,/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^No,/ })).toBeDisabled();
  });

  it('enables the positions for a published claim and joins the queue on click', () => {
    mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim()] } });
    render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);
    openPopover();

    const yes = screen.getByRole('button', { name: /^Yes,/ });
    expect(yes).toBeEnabled();
    expect(yes).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(yes);
    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-entity-1', request: { position: true } });
  });

  it('marks the chosen position selected while waiting and leaves the queue when clicked again', () => {
    mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim({ viewer_waiting_position: true })] } });
    render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);
    openPopover();

    const yes = screen.getByRole('button', { name: /^Yes,.*selected/ });
    expect(yes).toHaveAttribute('aria-pressed', 'true');
    expect(yes).toBeEnabled();
    expect(screen.getByText('Waiting for someone with the opposite position.')).toBeInTheDocument();

    fireEvent.click(yes);
    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-entity-1' });
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });

  // Once geo-chat advertises matchmaking, a position is only an intent — debates start from an
  // explicit request in the hub instead of auto-pairing whoever is waiting.
  describe('with matchmaking support', () => {
    beforeEach(() => {
      mocks.matchmakingSupported.mockReturnValue(true);
    });

    it('records an intent instead of joining the queue', () => {
      mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim()] } });
      render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);
      openPopover();

      expect(screen.getByText('Set your position')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^Yes,/ }));

      expect(mocks.setIntentMutate).toHaveBeenCalledWith({
        spaceId: 'space-1',
        claimId: 'claim-entity-1',
        position: true,
      });
      expect(mocks.joinMutate).not.toHaveBeenCalled();
    });

    it('clears the intent when the held position is clicked again', () => {
      mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim({ viewer_waiting_position: true })] } });
      render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);
      openPopover();

      fireEvent.click(screen.getByRole('button', { name: /^Yes,.*selected/ }));

      expect(mocks.clearIntentMutate).toHaveBeenCalledWith({ spaceId: 'space-1', claimId: 'claim-entity-1' });
      expect(mocks.leaveMutate).not.toHaveBeenCalled();
    });

    it('points a saved position at the matchmaking hub rather than a passive wait', () => {
      mocks.debateClaims.mockReturnValue({ data: { claims: [debateClaim({ viewer_waiting_position: true })] } });
      render(<ClaimDebateButton entityId="claim-entity-1" spaceId="space-1" entity={entity([])} />);
      openPopover();

      expect(screen.queryByText('Waiting for someone with the opposite position.')).not.toBeInTheDocument();
      expect(screen.getByText('Position saved. Find someone to debate it.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Open Debates' }));

      expect(mocks.openHub).toHaveBeenCalledWith('matches');
    });
  });
});

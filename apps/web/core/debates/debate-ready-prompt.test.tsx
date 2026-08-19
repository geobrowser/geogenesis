import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from './api';
import { DebateReadyPrompt, DebateRejoinBar } from './debate-ready-prompt';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  abortMutateAsync: vi.fn(),
  abortPending: false,
  clearDebateActivity: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('./hooks', () => ({
  useAbortDebate: () => ({ mutateAsync: mocks.abortMutateAsync, isPending: mocks.abortPending }),
  useClearDebateActivity: () => mocks.clearDebateActivity,
}));

// useSpaceLabels reads the browse sidebar's cache before falling back to the mock below. These
// suites render without a QueryClientProvider, so the read is stubbed as "nothing cached yet".
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => null,
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

const participant = (overrides: Partial<DebateParticipant>): DebateParticipant =>
  ({
    user_id: 'user-me',
    profile_space_id: 'space-me',
    display_name: 'You',
    avatar_cid: null,
    participant_slot: 1,
    position: true,
    position_label: 'Yes',
    joined_at: null,
    ready_at: null,
    ...overrides,
  }) as DebateParticipant;

const debate = (overrides: Partial<Debate> = {}): Debate =>
  ({
    id: 'debate-1',
    status: 'ready',
    turn_format_id: null,
    claim: {
      id: 'claim-row-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-1',
      claim: 'Fast fashion should be discouraged with higher taxation',
      description: null,
    },
    participants: [
      participant({}),
      participant({ user_id: 'user-them', profile_space_id: 'space-them', display_name: 'Salina Mitchell' }),
    ],
    ...overrides,
  }) as Debate;

beforeEach(() => {
  mocks.push.mockReset();
  mocks.abortMutateAsync.mockReset();
  mocks.abortMutateAsync.mockResolvedValue(debate({ status: 'cancelled' }));
  mocks.abortPending = false;
  mocks.clearDebateActivity.mockReset();
});
afterEach(cleanup);

describe('DebateReadyPrompt', () => {
  it('walks the viewer into the room without moving them first', () => {
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" />);

    expect(screen.getByText('Your debate is ready')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));

    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
  });

  // The room is a server segment with no loading boundary: the router keeps this page on screen
  // until it resolves, so an unmarked button reads as broken and each further click stacks another
  // history entry — which is exactly what it did.
  it('shows that it is joining and ignores further clicks', () => {
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" />);

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));

    const joining = screen.getByRole('button', { name: 'Joining…' });
    fireEvent.click(joining);
    fireEvent.click(joining);

    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  // Leaving this live matters: if the navigation never lands, it is the only way out of a dialog
  // that covers the page.
  it('can still be declined while joining', () => {
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" />);

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(mocks.abortMutateAsync).toHaveBeenCalled();
  });

  it('says so when the debate is already under way', () => {
    render(<DebateReadyPrompt debate={debate({ status: 'in_progress' })} currentUserId="user-me" />);

    expect(screen.getByText('Your debate is under way')).toBeInTheDocument();
  });

  // The reported bug: declining only closed the popup, so the opponent sat in the ready screen
  // waiting for someone who had already decided not to come. Only the server can tell them.
  it('cancels the debate for both sides when declined', async () => {
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" />);

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() => expect(mocks.abortMutateAsync).toHaveBeenCalledTimes(1));
    // Locally too, so every Debate control comes back without waiting for the gateway.
    await waitFor(() => expect(mocks.clearDebateActivity).toHaveBeenCalledWith('debate-1'));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('says so while the decline is in flight', () => {
    mocks.abortPending = true;
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" />);

    expect(screen.getByRole('button', { name: 'Declining…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join debate' })).toBeDisabled();
  });

  // The debate is still live if the abort never lands, so closing over the failure would strand
  // both sides again — with nothing on screen to say why.
  it('keeps the dialog open with the reason when the decline fails', async () => {
    mocks.abortMutateAsync.mockRejectedValue(new Error('Network unreachable'));
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" />);

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(await screen.findByText('Network unreachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join debate' })).toBeInTheDocument();
    expect(mocks.clearDebateActivity).not.toHaveBeenCalled();
  });

  it('stays silent about a debate it cannot name both sides of', () => {
    render(<DebateReadyPrompt debate={debate({ participants: [participant({})] })} currentUserId="user-me" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('DebateRejoinBar', () => {
  // The fallback for a debate the dialog cannot describe: nothing else in the app links to an
  // unfinished debate, while an active one greys out every Debate control.
  it('keeps a way into a debate the prompt cannot name', () => {
    render(<DebateRejoinBar debate={debate()} />);

    fireEvent.click(screen.getByRole('button', { name: /Your debate is ready/ }));

    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
  });
});

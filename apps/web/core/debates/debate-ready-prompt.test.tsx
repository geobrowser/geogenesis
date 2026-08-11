import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from './api';
import { DebateReadyPrompt } from './debate-ready-prompt';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
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

beforeEach(() => mocks.push.mockReset());
afterEach(cleanup);

describe('DebateReadyPrompt', () => {
  it('walks the viewer into the room without moving them first', () => {
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" onNotNow={vi.fn()} />);

    expect(screen.getByText('Your debate is ready')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));

    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
  });

  it('says so when the debate is already under way', () => {
    render(<DebateReadyPrompt debate={debate({ status: 'in_progress' })} currentUserId="user-me" onNotNow={vi.fn()} />);

    expect(screen.getByText('Your debate is under way')).toBeInTheDocument();
  });

  // "Not now" is local, the same as the request popup's: the debate is still there to walk into.
  it('leaves the debate alone when dismissed', () => {
    const onNotNow = vi.fn();
    render(<DebateReadyPrompt debate={debate()} currentUserId="user-me" onNotNow={onNotNow} />);

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onNotNow).toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('stays silent about a debate it cannot name both sides of', () => {
    render(
      <DebateReadyPrompt
        debate={debate({ participants: [participant({})] })}
        currentUserId="user-me"
        onNotNow={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

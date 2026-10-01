import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateParticipant } from '~/core/debates/api';

import { AUTOPLAY_NEXT_MS, DebateEndScreen } from './debate-end-screen';
import type { DebateStage } from './use-debate-stage';
import type { NextDebate } from './use-next-debate';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  recordAction: vi.fn(),
  castVote: vi.fn(),
  myPick: null as number | null,
  shares: null as [number, number] | null,
  next: [] as NextDebate[],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('~/core/analytics-operations', () => ({ recordAction: mocks.recordAction }));
vi.mock('~/core/action-context-provider', () => ({
  ActionSurface: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useActionContext: () => () => ({}),
}));
vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null }));
vi.mock('./use-next-debate', () => ({ useNextDebates: () => mocks.next }));
vi.mock('~/core/debates/use-debate-votes', () => ({
  useDebateVotes: () => ({
    isMyPick: (participant: DebateParticipant) => mocks.myPick === participant.participant_slot,
    sharePercentFor: (participant: DebateParticipant) =>
      mocks.shares ? mocks.shares[participant.participant_slot - 1] : null,
    hasVoted: mocks.myPick !== null,
    isVoting: false,
    castVote: mocks.castVote,
  }),
}));

const participant = (slot: 1 | 2, name: string, position: boolean) =>
  ({
    participant_slot: slot,
    position,
    display_name: name,
    profile_space_id: `space-${slot}`,
  }) as unknown as DebateParticipant;

const adam = participant(1, 'Adam', true);
const dovile = participant(2, 'Dovile', false);
const debate = { id: 'debate-1', participants: [adam, dovile] } as unknown as Debate;

const nextDebate = (id: string): NextDebate => ({
  debateId: id,
  spaceId: 'space-x',
  claimName: `Claim ${id}`,
  keyFrame: null,
  related: true,
  participants: [],
});

function stage(overrides: Partial<DebateStage> = {}): DebateStage {
  return {
    phase: 'live',
    stance: true,
    stanceHeld: false,
    signup: 'hidden',
    vote: vi.fn(),
    justWatch: vi.fn(),
    switchStance: vi.fn(),
    collapseSignup: vi.fn(),
    reopenSignup: vi.fn(),
    main: {} as DebateStage['main'],
    ...overrides,
  } as DebateStage;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.push.mockReset();
  mocks.recordAction.mockReset();
  mocks.castVote.mockReset();
  mocks.myPick = null;
  mocks.shares = null;
  mocks.next = [nextDebate('a'), nextDebate('b'), nextDebate('c')];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DebateEndScreen', () => {
  it('asks who won with one button per debater, in slot order', () => {
    render(<DebateEndScreen debate={debate} stage={stage()} onReplay={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Who won?' })).toBeInTheDocument();
    const names = screen.getAllByRole('button', { pressed: false }).map(button => button.textContent);
    expect(names.slice(0, 2)).toEqual(['Adam', 'Dovile']);
  });

  it('shows the result under the buttons in the same order once the viewer has picked', () => {
    mocks.myPick = 2;
    mocks.shares = [58, 42];
    render(<DebateEndScreen debate={debate} stage={stage({ stance: false })} onReplay={vi.fn()} />);
    expect(screen.getByText('Adam 58%')).toBeInTheDocument();
    expect(screen.getByText('42% Dovile')).toBeInTheDocument();
    const bar = screen.getByRole('img', { name: '58% Adam, 42% Dovile' });
    expect(bar).toBeInTheDocument();
  });

  it('offers a one-tap switch, in the vote’s own words, when the pick argued the other side', () => {
    mocks.myPick = 2;
    mocks.shares = [58, 42];
    const switchStance = vi.fn();
    render(<DebateEndScreen debate={debate} stage={stage({ stance: true, switchStance })} onReplay={vi.fn()} />);
    expect(screen.getByText(/You agreed, but picked Dovile, who argued/)).toHaveTextContent(
      'You agreed, but picked Dovile, who argued Disagree.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Disagree' }));
    expect(switchStance).toHaveBeenCalledWith(false);
  });

  it('says nothing about switching when the pick argued the viewer’s own side', () => {
    mocks.myPick = 1;
    mocks.shares = [58, 42];
    render(<DebateEndScreen debate={debate} stage={stage({ stance: true })} onReplay={vi.fn()} />);
    expect(screen.queryByText(/but picked/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Switch to/ })).not.toBeInTheDocument();
  });

  it('offers a first side to a viewer who chose "Just watch"', () => {
    mocks.myPick = 2;
    mocks.shares = [58, 42];
    const switchStance = vi.fn();
    render(<DebateEndScreen debate={debate} stage={stage({ stance: null, switchStance })} onReplay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    expect(switchStance).toHaveBeenCalledWith(false);
  });

  it('plays the highlighted debate when Play next has filled', () => {
    render(<DebateEndScreen debate={debate} stage={stage()} onReplay={vi.fn()} />);
    act(() => vi.advanceTimersByTime(AUTOPLAY_NEXT_MS - 200));
    expect(mocks.push).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(400));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push.mock.calls[0][0]).toContain('a');
    expect(mocks.recordAction).toHaveBeenCalledWith('play_next', {}, expect.objectContaining({ trigger: 'autoplay' }));
  });

  it('skips the wait when Play next is pressed', () => {
    render(<DebateEndScreen debate={debate} stage={stage()} onReplay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Play next/ }));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.recordAction).toHaveBeenCalledWith(
      'play_next',
      {},
      expect.objectContaining({ trigger: 'play_next_tap', slot: 1 })
    );
  });

  it('plays a suggestion straight away when it is tapped', () => {
    render(<DebateEndScreen debate={debate} stage={stage()} onReplay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Claim c' }));
    expect(mocks.push.mock.calls[0][0]).toContain('c');
  });

  it('holds the countdown while the viewer is on the screen, and carries on after', () => {
    render(<DebateEndScreen debate={debate} stage={stage()} onReplay={vi.fn()} />);
    const screenSection = screen.getByRole('region', { name: 'Debate over' });
    fireEvent.pointerEnter(screenSection);
    act(() => vi.advanceTimersByTime(AUTOPLAY_NEXT_MS * 2));
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.pointerLeave(screenSection);
    act(() => vi.advanceTimersByTime(AUTOPLAY_NEXT_MS + 200));
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it('stops for good on "Pause autoplay"', () => {
    render(<DebateEndScreen debate={debate} stage={stage()} onReplay={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause autoplay' }));
    act(() => vi.advanceTimersByTime(AUTOPLAY_NEXT_MS * 3));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Autoplay paused' })).toBeDisabled();
  });

  it('draws no countdown at all when there is nothing to watch next', () => {
    mocks.next = [];
    render(<DebateEndScreen debate={debate} stage={stage()} onReplay={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Play next/ })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(AUTOPLAY_NEXT_MS * 2));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

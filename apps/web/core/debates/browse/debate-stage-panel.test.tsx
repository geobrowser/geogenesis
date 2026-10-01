import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipant } from '~/core/debates/api';
import type { TimedClaim } from '~/core/debates/claim-timing';

import { DebateStagePanel, type StagePanelClaim } from './debate-stage-panel';
import type { DebateStage } from './use-debate-stage';

const mocks = vi.hoisted(() => ({
  respond: vi.fn(),
  viewerPosition: null as boolean | null,
  summary: { hasCounts: true, percent: 64, total: 412 },
  beginPrivyAuth: vi.fn(),
  prepareOnboarding: vi.fn(),
  accountStep: vi.fn(),
}));

vi.mock('~/core/action-context-provider', () => ({
  ActionSurface: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));
vi.mock('./use-debate-claim-response', () => ({
  useDebateClaimResponse: () => ({
    responseKind: 'stance',
    summary: mocks.summary,
    control: {
      viewerPosition: mocks.viewerPosition,
      canRespond: true,
      respond: mocks.respond,
      actionTitle: () => '',
    },
  }),
}));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => mocks.prepareOnboarding }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));
vi.mock('~/core/privy-auth-events', () => ({ beginPrivyAuth: mocks.beginPrivyAuth, cancelPrivyAuth: vi.fn() }));
vi.mock('~/partials/explore/email-capture-account-step', () => ({
  AccountStep: (props: { email: string }) => {
    mocks.accountStep(props);
    return <div data-testid="account-step">{props.email}</div>;
  },
}));
vi.mock('~/design-system/avatar', () => ({ Avatar: () => null }));

function stage(overrides: Partial<DebateStage> = {}): DebateStage {
  return {
    phase: 'stance',
    stance: null,
    stanceHeld: false,
    signup: 'hidden',
    vote: vi.fn(),
    justWatch: vi.fn(),
    switchStance: vi.fn(),
    collapseSignup: vi.fn(),
    reopenSignup: vi.fn(),
    main: { responseKind: 'stance' } as DebateStage['main'],
    ...overrides,
  } as DebateStage;
}

const speaker = { participant_slot: 1, display_name: 'Adam', profile_space_id: 'space-1' } as unknown as DebateParticipant;
const LONG_CLAIM =
  'Open-source innovation provides different perspectives and methods for solving problems that no single closed lab, however well funded, can match on its own.';
const claim: StagePanelClaim = {
  window: { claim: { id: 'claim-9', text: LONG_CLAIM, spaceId: 'space-1' } as TimedClaim, startMs: 0, endMs: 1 },
  speaker,
  row: null,
  entity: null,
  position: 3,
  total: 7,
};

function renderPanel(props: Partial<React.ComponentProps<typeof DebateStagePanel>> = {}) {
  const onVote = vi.fn();
  const onJustWatch = vi.fn();
  render(
    <DebateStagePanel
      stage={stage()}
      debateId="debate-1"
      claimText="Open-weight AI will outperform closed AI ecosystems."
      claim={null}
      caption={null}
      onVote={onVote}
      onJustWatch={onJustWatch}
      onAnswered={vi.fn()}
      variant="side"
      {...props}
    />
  );
  return { onVote, onJustWatch };
}

afterEach(cleanup);
beforeEach(() => {
  mocks.respond.mockReset();
  mocks.viewerPosition = null;
  mocks.beginPrivyAuth.mockReset();
  mocks.prepareOnboarding.mockReset();
});

describe('DebateStagePanel before the debate', () => {
  it('asks "Where do you stand?" with the claim above Agree / Disagree', () => {
    const { onVote } = renderPanel();
    expect(screen.getByText('Vote to start watching')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Where do you stand?' })).toBeInTheDocument();
    expect(screen.getByText('Open-weight AI will outperform closed AI ecosystems.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    expect(onVote).toHaveBeenCalledWith(false);
  });

  it('offers "Just watch" as a way to start without a side', () => {
    const { onJustWatch } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Just watch' }));
    expect(onJustWatch).toHaveBeenCalled();
  });

  it('keeps the buttons disabled while the viewer’s side is still loading', () => {
    renderPanel({ stage: stage({ phase: 'deciding' }) });
    expect(screen.getByRole('button', { name: 'Agree' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeDisabled();
  });
});

describe('DebateStagePanel inline sign-up', () => {
  it('asks for an email, with the held vote named, while the debate plays', () => {
    renderPanel({ stage: stage({ phase: 'live', stance: true, stanceHeld: true, signup: 'open' }) });
    expect(screen.getByText('Your vote: Agree · not counted yet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Confirm your email so your vote counts' })).toBeInTheDocument();
  });

  it('turns away a malformed email without starting a sign-in', () => {
    renderPanel({ stage: stage({ phase: 'live', stance: true, signup: 'open' }) });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That doesn’t look like an email address.');
    expect(mocks.beginPrivyAuth).not.toHaveBeenCalled();
  });

  it('hands a good email to the account step, which sends the code', () => {
    renderPanel({ stage: stage({ phase: 'live', stance: true, signup: 'open' }) });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(expect.objectContaining({ component: 'debate_inline_signup' }));
    expect(mocks.prepareOnboarding).toHaveBeenCalled();
    expect(screen.getByTestId('account-step')).toHaveTextContent('sam@example.com');
  });

  it('collapses to a chip on "Not now" that reopens the sign-up', () => {
    const collapseSignup = vi.fn();
    renderPanel({ stage: stage({ phase: 'live', stance: true, signup: 'open', collapseSignup }) });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(collapseSignup).toHaveBeenCalled();

    cleanup();
    const reopenSignup = vi.fn();
    renderPanel({ stage: stage({ phase: 'live', stance: true, signup: 'collapsed', reopenSignup }) });
    fireEvent.click(screen.getByRole('button', { name: /Vote not counted/ }));
    expect(reopenSignup).toHaveBeenCalled();
  });

  it('says the vote counts once the account exists', () => {
    renderPanel({ stage: stage({ phase: 'live', stance: true, signup: 'confirmed' }) });
    expect(screen.getByRole('status')).toHaveTextContent('✓ Your vote counts');
  });
});

describe('DebateStagePanel live claims', () => {
  it('shows the whole claim, who said it and where it falls, with both sides as buttons', () => {
    renderPanel({ stage: stage({ phase: 'live' }), claim });
    expect(screen.getByText(LONG_CLAIM)).not.toHaveClass('line-clamp-2');
    expect(screen.getByText('Adam’s claim')).toBeInTheDocument();
    expect(screen.getByText('3 of 7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(mocks.respond).toHaveBeenCalledWith(true);
  });

  it('keeps the crowd’s split hidden until the viewer has answered', () => {
    renderPanel({ stage: stage({ phase: 'live' }), claim });
    expect(screen.queryByText(/64% agree/)).not.toBeInTheDocument();

    cleanup();
    mocks.viewerPosition = true;
    renderPanel({ stage: stage({ phase: 'live' }), claim });
    expect(screen.getByText('Your view is saved')).toBeInTheDocument();
    expect(screen.getByText('64% agree · 412 votes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agree' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('carries what is being said between claims on a phone', () => {
    renderPanel({
      stage: stage({ phase: 'live' }),
      variant: 'below',
      caption: { speaker, text: 'and every one of those labs builds on an open model' },
    });
    expect(screen.getByText('and every one of those labs builds on an open model')).toBeInTheDocument();
  });
});

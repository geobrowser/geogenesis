import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { useDebateStage } from './use-debate-stage';

const mocks = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true },
  main: {
    known: true,
    responseKind: 'stance',
    summary: { hasCounts: true, total: 12, percent: 50 },
    control: { viewerPosition: null as boolean | null, canRespond: true, respond: vi.fn() },
  },
  recordAction: vi.fn(),
}));

vi.mock('./use-main-claim-response', () => ({ useMainClaimResponse: () => mocks.main }));
vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => mocks.auth }));
vi.mock('~/core/action-context-provider', () => ({ useActionContext: () => () => ({}) }));
vi.mock('~/core/analytics-operations', () => ({ recordAction: mocks.recordAction }));

const debate = { id: 'debate-1', claim: { claim_entity_id: 'claim-1', space_id: 'space-1' } } as unknown as Debate;

function render(overrides: Partial<Parameters<typeof useDebateStage>[0]> = {}) {
  return renderHook(props => useDebateStage(props), {
    initialProps: { debate, immersive: true, enabled: true, initialSeekSeconds: null, ...overrides },
  });
}

afterEach(cleanup);

beforeEach(() => {
  mocks.auth = { ready: true, authenticated: true };
  mocks.main.known = true;
  mocks.main.control = { viewerPosition: null, canRespond: true, respond: vi.fn() };
  mocks.recordAction.mockReset();
});

describe('useDebateStage', () => {
  it('asks for a stance when the viewer has none', () => {
    expect(render().result.current.phase).toBe('stance');
  });

  it('plays as before for a viewer who already took a side', () => {
    mocks.main.control.viewerPosition = false;
    expect(render().result.current.phase).toBe('live');
  });

  it('holds while the viewer’s side is still unknown, so the question never flashes up and away', () => {
    mocks.main.known = false;
    expect(render().result.current.phase).toBe('deciding');
  });

  it('never asks outside the full-screen view, or on a link that named a moment', () => {
    expect(render({ immersive: false }).result.current.phase).toBe('live');
    expect(render({ initialSeekSeconds: 42 }).result.current.phase).toBe('live');
  });

  it('publishes a signed-in vote through the claim’s own control and starts the debate', () => {
    const { result } = render();
    act(() => result.current.vote(true));
    expect(mocks.main.control.respond).toHaveBeenCalledWith(true);
    expect(result.current.phase).toBe('live');
    expect(result.current.signup).toBe('hidden');
  });

  it('holds a signed-out vote, starts the debate anyway, and opens the inline sign-up', () => {
    mocks.auth = { ready: true, authenticated: false };
    const { result } = render();
    act(() => result.current.vote(false));
    expect(mocks.main.control.respond).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('live');
    expect(result.current.signup).toBe('open');
    expect(result.current.stance).toBe(false);
    expect(result.current.stanceHeld).toBe(true);
    expect(mocks.recordAction).toHaveBeenCalledWith('stance_hold', {}, { position: 'disagree' });
  });

  it('collapses the sign-up to a chip on "Not now", and reopens it from the chip', () => {
    mocks.auth = { ready: true, authenticated: false };
    const { result } = render();
    act(() => result.current.vote(true));
    act(() => result.current.collapseSignup());
    expect(result.current.signup).toBe('collapsed');
    act(() => result.current.reopenSignup());
    expect(result.current.signup).toBe('open');
  });

  it('publishes the held vote once the new account can, and moves the panel on to onboarding', () => {
    mocks.auth = { ready: true, authenticated: false };
    const { result, rerender } = render();
    act(() => result.current.vote(true));

    mocks.auth = { ready: true, authenticated: true };
    rerender({ debate, immersive: true, enabled: true, initialSeekSeconds: null });

    expect(mocks.main.control.respond).toHaveBeenCalledWith(true);
    expect(result.current.signup).toBe('onboarding');

    act(() => result.current.finishOnboarding());
    expect(result.current.signup).toBe('confirmed');
  });

  it('lets onboarding be put off to a chip, and picked up again as onboarding', () => {
    mocks.auth = { ready: true, authenticated: false };
    const { result, rerender } = render();
    act(() => result.current.vote(true));
    mocks.auth = { ready: true, authenticated: true };
    rerender({ debate, immersive: true, enabled: true, initialSeekSeconds: null });

    act(() => result.current.collapseSignup());
    expect(result.current.signup).toBe('collapsed');
    act(() => result.current.reopenSignup());
    expect(result.current.signup).toBe('onboarding');
  });

  it('waits for the account to be able to publish before replaying the held vote', () => {
    mocks.auth = { ready: true, authenticated: false };
    const { result, rerender } = render();
    act(() => result.current.vote(true));

    mocks.auth = { ready: true, authenticated: true };
    mocks.main.control.canRespond = false;
    rerender({ debate, immersive: true, enabled: true, initialSeekSeconds: null });
    expect(mocks.main.control.respond).not.toHaveBeenCalled();

    mocks.main.control.canRespond = true;
    rerender({ debate, immersive: true, enabled: true, initialSeekSeconds: null });
    expect(mocks.main.control.respond).toHaveBeenCalledWith(true);
  });

  it('starts without a side on "Just watch", and records how', () => {
    const { result } = render();
    act(() => result.current.justWatch('video_tap'));
    expect(result.current.phase).toBe('live');
    expect(result.current.stance).toBeNull();
    expect(mocks.recordAction).toHaveBeenCalledWith('just_watch', {}, { via: 'video_tap' });
  });

  it('switches side from the end screen and records where from', () => {
    mocks.main.control.viewerPosition = true;
    const { result } = render();
    act(() => result.current.switchStance(false));
    expect(mocks.main.control.respond).toHaveBeenCalledWith(false);
    expect(mocks.recordAction).toHaveBeenCalledWith('stance_switch', {}, { from: 'agree', to: 'disagree' });
  });

  it('does nothing when asked to switch to the side already held', () => {
    mocks.main.control.viewerPosition = true;
    const { result } = render();
    act(() => result.current.switchStance(true));
    expect(mocks.main.control.respond).not.toHaveBeenCalled();
    expect(mocks.recordAction).not.toHaveBeenCalled();
  });
});

import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingReadiness } from './api';
// eslint-disable-next-line import/first
import { useAutoDebateReadiness } from './use-auto-debate-readiness';

const mocks = vi.hoisted(() => ({
  setReady: vi.fn(),
  control: {
    checked: false,
    disabled: false,
    viewerPosition: null as boolean | null,
  },
  activity: null as { debate?: unknown; rematch?: unknown } | null,
}));

vi.mock('./hooks', () => ({
  useDebateActivity: () => ({ data: mocks.activity }),
}));

vi.mock('./use-claim-debate-readiness', () => ({
  useClaimDebateReadiness: (args: { canEnable: boolean }) => {
    mocks.lastCanEnable = args.canEnable;
    return { ...mocks.control, setReady: mocks.setReady };
  },
}));

const readiness: MatchmakingReadiness = {
  response_kind: 'stance',
  viewer_response: null,
  viewer_debate_ready: false,
  readiness_disabled_reason: null,
};

function render(overrides: Partial<Parameters<typeof useAutoDebateReadiness>[0]> = {}) {
  return renderHook(() =>
    useAutoDebateReadiness({
      entityId: 'claim-1',
      spaceId: 'space-1',
      readiness,
      ...overrides,
    })
  );
}

beforeEach(() => {
  mocks.setReady.mockReset();
  mocks.control = { checked: false, disabled: false, viewerPosition: null };
  mocks.activity = null;
});

/**
 * The rule that replaced the Debate switch: hold a position and you are ready to argue it. There is
 * no control to press and nothing on screen to notice, so these are the only place the behaviour is
 * stated — and the guards matter more than the happy path, because every one of them is a way to
 * stand someone up who did not ask.
 */
describe('useAutoDebateReadiness', () => {
  it('stands the viewer ready once they hold a position', () => {
    mocks.control.viewerPosition = true;
    render();
    expect(mocks.setReady).toHaveBeenCalledWith(true);
  });

  it('does nothing without a position', () => {
    render();
    expect(mocks.setReady).not.toHaveBeenCalled();
  });

  it('stands the viewer ready on either side', () => {
    // Disagreeing is a position too. Readiness follows holding one, not holding the popular one.
    mocks.control.viewerPosition = false;
    render();
    expect(mocks.setReady).toHaveBeenCalledWith(true);
  });

  it('leaves an already-ready claim alone', () => {
    // Includes a pending intent, which `checked` reports optimistically — so a re-render while the
    // queue request is in flight does not send a second one.
    mocks.control.viewerPosition = true;
    mocks.control.checked = true;
    render();
    expect(mocks.setReady).not.toHaveBeenCalled();
  });

  it('respects the machine refusing', () => {
    // `disabled` covers being signed out, an unpublished claim, and a response still indexing. The
    // rule does not get to override any of them.
    mocks.control.viewerPosition = true;
    mocks.control.disabled = true;
    render();
    expect(mocks.setReady).not.toHaveBeenCalled();
  });

  it('will not stand anyone up while a debate is running on the claim', () => {
    mocks.control.viewerPosition = true;
    render({ activeDebate: true });
    expect(mocks.lastCanEnable).toBe(false);
  });

  it('will not stand anyone up while they are busy in a debate elsewhere', () => {
    mocks.control.viewerPosition = true;
    mocks.activity = { debate: { id: 'debate-9' } };
    render();
    expect(mocks.lastCanEnable).toBe(false);
  });

  it('stays out of it entirely for a claim the graph cannot resolve', () => {
    mocks.control.viewerPosition = true;
    render({ enabled: false });
    expect(mocks.setReady).not.toHaveBeenCalled();
    expect(mocks.lastCanEnable).toBe(false);
  });
});

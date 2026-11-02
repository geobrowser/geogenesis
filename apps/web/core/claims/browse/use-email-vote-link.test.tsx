import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotActionContext } from '~/core/action-context';

import { markEmailVoteLinkHandled } from './email-vote-link';
import { useEmailVoteLink } from './use-email-vote-link';

const CLAIM = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SPACE = 'space-1';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  setupPending: false,
  userId: 'did:privy:a',
  openPrompt: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, user: { id: mocks.userId } }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: mocks.setupPending }),
}));
vi.mock('~/core/state/save-votes-prompt', () => ({
  openSaveVotesPrompt: (...args: unknown[]) => mocks.openPrompt(...args),
}));
vi.mock('~/core/action-context-provider', () => ({
  useActionContext: (component: 'claim_position_control', targetType: string, targetId: string) => () =>
    snapshotActionContext(component, targetType, targetId),
}));

/** What a press records: the side, and the email the action context names at that moment. */
const pressed: { position: boolean; refEmail: string | undefined }[] = [];
const respond = (position: boolean) =>
  pressed.push({
    position,
    refEmail: snapshotActionContext('claim_position_control', 'claim', CLAIM).ref_email,
  });

type Props = Parameters<typeof useEmailVoteLink>[0];
const baseProps: Props = {
  claimId: CLAIM,
  spaceId: SPACE,
  viewerPosition: null,
  answersReady: true,
  canRespond: true,
  isConnected: true,
  respond,
};

function arriveAt(url: string) {
  window.history.replaceState(null, '', url);
}

function render(props: Partial<Props> = {}) {
  return renderHook((next: Partial<Props>) => useEmailVoteLink({ ...baseProps, ...next }), { initialProps: props });
}

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
  pressed.length = 0;
  mocks.ready = true;
  mocks.authenticated = true;
  mocks.setupPending = false;
  mocks.userId = 'did:privy:a';
  mocks.openPrompt.mockReset();
  arriveAt(`/space/${SPACE}/${CLAIM}?side=disagree&ref_email=welcome`);
});

describe('useEmailVoteLink', () => {
  it('casts the side for a signed-in reader, credits the email, and clears the trigger', () => {
    const { result } = render();

    expect(pressed).toEqual([{ position: false, refEmail: 'welcome' }]);
    expect(result.current).toEqual({ kind: 'cast', position: false });
    expect(window.location.search).toBe('?ref_email=welcome');
    expect(mocks.openPrompt).not.toHaveBeenCalled();
  });

  it('keeps a side the reader already holds and casts nothing', () => {
    const { result } = render({ viewerPosition: true });

    expect(pressed).toEqual([]);
    expect(result.current).toEqual({ kind: 'kept', position: true });
    expect(window.location.search).toBe('?ref_email=welcome');
  });

  it('waits for the reader’s own side before deciding', () => {
    const { result, rerender } = render({ answersReady: false });
    expect(pressed).toEqual([]);
    expect(window.location.search).toContain('side=disagree');

    rerender({ answersReady: true, viewerPosition: false });
    expect(pressed).toEqual([]);
    expect(result.current).toEqual({ kind: 'kept', position: false });
  });

  it('waits while a session is still restoring', () => {
    mocks.ready = false;
    mocks.authenticated = false;
    const { rerender } = render();
    expect(pressed).toEqual([]);

    mocks.ready = true;
    mocks.authenticated = true;
    rerender({});
    expect(pressed).toEqual([{ position: false, refEmail: 'welcome' }]);
  });

  it('keeps the side on the device when signed out, and asks to log in', () => {
    mocks.authenticated = false;
    render({ isConnected: false });

    expect(pressed).toEqual([{ position: false, refEmail: 'welcome' }]);
    expect(mocks.openPrompt).toHaveBeenCalledWith('email_link');
  });

  it('casts once per arrival, however often the page re-renders', () => {
    const { rerender } = render();
    rerender({ viewerPosition: false });
    rerender({ viewerPosition: null });
    expect(pressed).toHaveLength(1);
  });

  it('casts nothing when the same email is opened again after the vote was undone', () => {
    markEmailVoteLinkHandled({ viewerId: 'did:privy:a', claimId: CLAIM, spaceId: SPACE });
    const { result } = render();

    expect(pressed).toEqual([]);
    expect(result.current).toBeNull();
    expect(window.location.search).toBe('?ref_email=welcome');
  });

  it('still casts for another account on a browser where one already answered this link', () => {
    markEmailVoteLinkHandled({ viewerId: 'did:privy:a', claimId: CLAIM, spaceId: SPACE });
    mocks.userId = 'did:privy:b';
    render();
    expect(pressed).toEqual([{ position: false, refEmail: 'welcome' }]);
  });

  it('casts nothing on a reload, once the trigger is gone', () => {
    render();
    cleanup();
    window.localStorage.clear();
    render();
    expect(pressed).toHaveLength(1);
  });

  it('leaves a link for another claim alone', () => {
    arriveAt(`/space/${SPACE}/ffffffffffffffffffffffffffffffff?side=agree`);
    render();
    expect(pressed).toEqual([]);
    expect(window.location.search).toBe('?side=agree');
  });

  it('does nothing where responding is blocked', () => {
    render({ canRespond: false });
    expect(pressed).toEqual([]);
  });

  it('leaves the email out of the context when it is not a plain slug', () => {
    arriveAt(`/space/${SPACE}/${CLAIM}?side=agree&ref_email=someone%40example.com`);
    act(() => {
      render();
    });
    expect(pressed).toEqual([{ position: true, refEmail: undefined }]);
  });
});

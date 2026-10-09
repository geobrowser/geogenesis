import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember, DebateLobbyView } from '../api';

const mocks = vi.hoisted(() => ({
  viewerId: null as string | null,
  signIn: vi.fn(),
  mutateAsync: vi.fn(async () => ({ id: 'challenge-1' })),
  activity: { data: undefined as object | undefined },
  requests: { data: undefined as object | undefined },
}));

vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => mocks.viewerId }));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useDebateActivity: () => mocks.activity,
  useCreateDebateChallenge: () => ({ mutateAsync: mocks.mutateAsync }),
}));
vi.mock('../matchmaking/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../matchmaking/hooks')>()),
  useDebateRequests: () => mocks.requests,
}));
vi.mock('../matchmaking/use-live-request-block', () => ({
  useLiveRequestBlock: () => ({ blockedReason: null, buttonsDisabled: false, outboundChallenge: null }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/action-context-provider', () => ({
  useActionContext: () => () => ({ component: 'debate_matchmaking', target_id: '', target_type: 'entity' }),
}));

const { pendingActionsAtom } = await import('~/core/state/pending-actions');
const {
  LOBBY_QUEUED_REQUEST_COPY,
  LobbyQueuedRequestProvider,
  checkQueuedLobbyRequest,
  decodeQueuedLobbyRequest,
  encodeQueuedLobbyRequest,
  useLobbyQueuedRequest,
} = await import('./lobby-queued-request');

function member(userId: string, overrides: Partial<DebateLobbyMember> = {}): DebateLobbyMember {
  return {
    user_id: userId,
    profile_space_id: `space-${userId}`,
    display_name: userId === 'dan' ? 'Daniel' : userId,
    avatar_cid: null,
    role: 'speaker',
    creator: false,
    acting_host: false,
    on_roster_since: '2026-10-09T10:00:00Z',
    stepped_out: false,
    in_debate: false,
    ...overrides,
  };
}

function lobby(members: DebateLobbyMember[]): DebateLobbyView {
  return {
    lobby_id: 'lobby1',
    name: 'Hour',
    access: { status: 'admitted' },
    starts_at: 'x',
    opens_at: 'x',
    scheduled: false,
    created_by: null,
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members,
    viewer: {
      role: null,
      creator: false,
      hosting: false,
      reminded: false,
      voice_away_at: null,
      connected: false,
      stepped_out: false,
    },
  };
}

beforeEach(() => {
  mocks.viewerId = null;
  mocks.activity = { data: undefined };
  mocks.requests = { data: undefined };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('checkQueuedLobbyRequest', () => {
  const request = decodeQueuedLobbyRequest(encodeQueuedLobbyRequest(member('dan')))!;

  it('round-trips who was tapped', () => {
    expect(request).toEqual({ user_id: 'dan', profile_space_id: 'space-dan', name: 'Daniel' });
    expect(decodeQueuedLobbyRequest('not json')).toBeNull();
    expect(decodeQueuedLobbyRequest(undefined)).toBeNull();
  });

  it('sends to someone still here and free', () => {
    expect(checkQueuedLobbyRequest(request, lobby([member('dan')]), 'me', null)).toMatchObject({ send: true });
  });

  it('says why when it no longer stands', () => {
    expect(checkQueuedLobbyRequest(request, lobby([]), 'me', null)).toEqual({
      send: false,
      message: LOBBY_QUEUED_REQUEST_COPY.left('Daniel'),
    });
    expect(checkQueuedLobbyRequest(request, lobby([member('dan', { in_debate: true })]), 'me', null)).toEqual({
      send: false,
      message: LOBBY_QUEUED_REQUEST_COPY.busy('Daniel'),
    });
    expect(checkQueuedLobbyRequest(request, lobby([member('dan')]), 'dan', null)).toEqual({
      send: false,
      message: LOBBY_QUEUED_REQUEST_COPY.self,
    });
    expect(checkQueuedLobbyRequest(request, lobby([member('dan')]), 'me', 'You’re already in a debate.')).toMatchObject(
      { send: false, message: expect.stringMatching(/already in a debate/) }
    );
  });
});

function Probe({ target }: { target: DebateLobbyMember }) {
  const { pending, request, outcome } = useLobbyQueuedRequest();
  return (
    <div>
      <button type="button" onClick={() => request(target)}>
        tap
      </button>
      <p data-testid="pending">{pending?.name ?? 'none'}</p>
      <p data-testid="outcome">{outcome ?? ''}</p>
    </div>
  );
}

function renderProvider(view: DebateLobbyView) {
  const store = createStore();
  const ui = (guest: boolean, joined: boolean, current: DebateLobbyView) => (
    <Provider store={store}>
      <LobbyQueuedRequestProvider lobby={current} guest={guest} joined={joined}>
        <Probe target={member('dan')} />
      </LobbyQueuedRequestProvider>
    </Provider>
  );
  const result = render(ui(true, false, view));
  return {
    store,
    signedIn: (current: DebateLobbyView) => {
      mocks.viewerId = 'me';
      mocks.activity = { data: {} };
      mocks.requests = { data: {} };
      result.rerender(ui(false, true, current));
    },
    runQueued: async () => {
      const [action] = store.get(pendingActionsAtom);
      await act(async () => {
        await action.run();
      });
    },
  };
}

describe('LobbyQueuedRequestProvider', () => {
  it('queues the tap and opens sign-up naming the target, withdrawn if sign-up is dismissed', () => {
    const { store } = renderProvider(lobby([member('dan')]));
    fireEvent.click(screen.getByRole('button', { name: 'tap' }));

    expect(screen.getByTestId('pending')).toHaveTextContent('Daniel');
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({
        auth_control: 'start_debate',
        auth_intent: 'start_debate',
        target_type: 'space',
        target_id: 'space-dan',
        link_source: 'lobby',
      }),
      expect.objectContaining({ onCancel: expect.any(Function) })
    );
    expect(store.get(pendingActionsAtom)).toHaveLength(1);

    const [, options] = mocks.signIn.mock.calls[0] as [unknown, { onCancel: () => void }];
    act(() => options.onCancel());
    expect(store.get(pendingActionsAtom)).toHaveLength(0);
  });

  it('sends the lobby-scoped request after sign-up, without a second tap', async () => {
    const view = lobby([member('dan')]);
    const { signedIn, runQueued } = renderProvider(view);
    fireEvent.click(screen.getByRole('button', { name: 'tap' }));
    signedIn(view);
    await runQueued();

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ recipient_profile_space_id: 'space-dan', lobby_id: 'lobby1' });
    await waitFor(() => expect(screen.getByTestId('outcome')).toHaveTextContent('Debate request sent to Daniel.'));
  });

  it('tells them why when the person left during sign-up', async () => {
    const { signedIn, runQueued } = renderProvider(lobby([member('dan')]));
    fireEvent.click(screen.getByRole('button', { name: 'tap' }));
    signedIn(lobby([]));
    await runQueued();

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('outcome')).toHaveTextContent(LOBBY_QUEUED_REQUEST_COPY.left('Daniel'))
    );
  });
});

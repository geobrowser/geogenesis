import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { zonedWallClockInstant } from '~/core/availability/peer-schedule';

import { type Debate, GeoChatRequestError, GeoChatSessionError } from '../api';
import { clearEnteringDebate, useEnteringDebateId } from '../debate-entry-intent';
import {
  CALENDAR_DAYS,
  useAcceptDebateRequest,
  useDebatePeople,
  useMatchmakingMatches,
  useSchedulablePeople,
} from './hooks';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  acceptDebateRequest: vi.fn(),
  listMatchmakingMatches: vi.fn(),
  listDebatePeople: vi.fn(),
  listSchedulablePeople: vi.fn(),
  accountKey: 'user-a' as string | null,
  promoteSession: vi.fn(),
  releaseSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    acceptDebateRequest: mocks.acceptDebateRequest,
    listMatchmakingMatches: mocks.listMatchmakingMatches,
    listDebatePeople: mocks.listDebatePeople,
    listSchedulablePeople: mocks.listSchedulablePeople,
  };
});

vi.mock('../hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../hooks')>();
  return {
    ...actual,
    useGeoChatAuth: () => ({
      accountKey: mocks.accountKey,
      authenticated: mocks.accountKey !== null,
      getPrivyIdentityToken: vi.fn(),
    }),
  };
});

vi.mock('../participant-avatars', () => ({ useParticipantAvatars: () => (person: unknown) => person }));

vi.mock('../debate-gateway', () => ({ useDebateGatewayScope: vi.fn(), useMatchmakingScope: () => true }));

vi.mock('../media-session', async importOriginal => ({
  ...(await importOriginal<typeof import('../media-session')>()),
  useOptionalDebateMediaSession: () => ({
    promoteSession: mocks.promoteSession,
    releaseSession: mocks.releaseSession,
  }),
}));

const debate = {
  id: 'debate-1',
  status: 'ready',
  claim: { id: 'claim-row-1', space_id: 'space-1', claim_entity_id: 'claim-1', claim: 'A claim', description: null },
  participants: [],
} as unknown as Debate;

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.acceptDebateRequest.mockReset();
  mocks.listMatchmakingMatches.mockReset();
  mocks.listDebatePeople.mockReset();
  mocks.listSchedulablePeople.mockReset();
  mocks.accountKey = 'user-a';
  mocks.promoteSession.mockReset();
  mocks.releaseSession.mockReset();
  clearEnteringDebate();
});

describe('useAcceptDebateRequest', () => {
  // GEO-2514 removed the match prompt that used to stand between accepting and the ready room, so
  // accepting has to walk this tab in itself. Nothing else would.
  it('walks the accepting tab into the debate room', async () => {
    mocks.acceptDebateRequest.mockResolvedValue({ request: { id: 'request-1' }, debate });

    const { result } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1'));
  });

  // The room route outlasts the activity refetch this mutation also kicks off, so the coordinator
  // needs to know this tab is on its way in — otherwise it prompts it to join what it is entering.
  it('claims the debate it is entering before it starts routing', async () => {
    mocks.acceptDebateRequest.mockResolvedValue({ request: { id: 'request-1' }, debate });
    const { result: intent } = renderHook(() => useEnteringDebateId());

    const { result } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });

    await waitFor(() => expect(intent.current).toBe('debate-1'));
  });

  it('hands the devices to the debate even after the accepting surface has gone', async () => {
    let answer!: (response: unknown) => void;
    mocks.acceptDebateRequest.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      })
    );

    const { result, unmount } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });
    unmount();

    answer({ request: { id: 'request-1' }, debate });

    await waitFor(() =>
      expect(mocks.promoteSession).toHaveBeenCalledWith('debate-request:request-1', 'debate:debate-1')
    );
  });

  it('lets the devices go when the accept produced no debate, surface gone or not', async () => {
    let answer!: (response: unknown) => void;
    mocks.acceptDebateRequest.mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      })
    );

    const { result, unmount } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });
    unmount();

    answer({ request: { id: 'request-1' }, debate: null });

    await waitFor(() => expect(mocks.releaseSession).toHaveBeenCalledWith('debate-request:request-1'));
    expect(mocks.promoteSession).not.toHaveBeenCalled();
  });

  it('stays put when acceptance produced no debate', async () => {
    mocks.acceptDebateRequest.mockResolvedValue({ request: { id: 'request-1' }, debate: null });

    const { result } = renderHook(() => useAcceptDebateRequest(), { wrapper });
    result.current.mutate({ requestId: 'request-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

/**
 * A viewer's own reads all fail together for an account geo-chat has not finished registering, and
 * they all come good a moment later. Reported from a fresh sign-up: the hub sat in "Something went
 * wrong" for a minute or two, because nothing here refetches on focus or reconnect and a first
 * failure had nowhere to go but the "Try again" button.
 */
describe('viewer-relative reads and a backend catching up', () => {
  /** The client's own retry is off, as the app's is; these queries carry their own. */
  function retryingWrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it('asks again when the server faults, and settles once it answers', async () => {
    mocks.listMatchmakingMatches
      .mockRejectedValueOnce(new GeoChatRequestError('nope', null, 503))
      .mockResolvedValue({ matches: [] });

    const { result } = renderHook(() => useMatchmakingMatches(true), { wrapper: retryingWrapper });

    await waitFor(() => expect(result.current.data).toEqual({ matches: [] }));
    expect(result.current.error).toBeNull();
    expect(mocks.listMatchmakingMatches).toHaveBeenCalledTimes(2);
  });

  // A malformed request is geo-chat telling us something. Asking three times gets the same answer,
  // and the viewer waits out two pointless round trips before being told what it already knew.
  it('takes a refusal at its word', async () => {
    mocks.listMatchmakingMatches.mockRejectedValue(new GeoChatRequestError('no', 'bad_request', 400));

    const { result } = renderHook(() => useMatchmakingMatches(true), { wrapper: retryingWrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(mocks.listMatchmakingMatches).toHaveBeenCalledTimes(1);
  });

  /**
   * A 401 is two different things, told apart by whether we have an identity at all.
   *
   * With one, it is geo-chat not having registered this viewer yet — true of every account for a
   * minute or two after sign-up, and the reported bug. Without one, it is the plain refusal it looks
   * like: the hub asks for its anonymous lists without a token, and waiting a minute for that would
   * be waiting for something that is not coming.
   */
  it('waits out a refusal aimed at a viewer it has an identity for', async () => {
    mocks.listMatchmakingMatches
      .mockRejectedValueOnce(new GeoChatSessionError(new GeoChatRequestError('not yet', null, 401)))
      .mockResolvedValue({ matches: [] });

    const { result } = renderHook(() => useMatchmakingMatches(true), { wrapper: retryingWrapper });

    await waitFor(() => expect(result.current.data).toEqual({ matches: [] }));
    expect(mocks.listMatchmakingMatches).toHaveBeenCalledTimes(2);
  });

  // Through People, which is one of the two lists the hub asks for without a token — the matches
  // query is simply not made without an account, so it cannot show this either way.
  /**
   * A 401 off a *resource* is the other 401, and waiting is the wrong answer to it.
   *
   * `getGeoChatSession` hands back the stored session until it is close to expiry, so a session the
   * server has stopped accepting is re-presented on every attempt and rejected every time.
   * `debate-gateway` already knows this — it reads the same status as `reauthenticate` and resets
   * the session. Retrying it nine times would spend ninety seconds re-offering rejected credentials
   * and then tell the viewer their account was being set up.
   */
  it('does not wait out a session the server has stopped accepting', async () => {
    mocks.accountKey = 'account-1';
    mocks.listDebatePeople.mockRejectedValue(new GeoChatRequestError('Unauthorized', null, 401));

    const { result } = renderHook(() => useDebatePeople(true), { wrapper: retryingWrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    // The transient budget, not the warm-up one: asked once, then given up on.
    expect(mocks.listDebatePeople).toHaveBeenCalledTimes(1);
  });

  it('does not wait one out for a viewer it has no identity for', async () => {
    mocks.accountKey = null;
    mocks.listDebatePeople.mockRejectedValue(new GeoChatSessionError(new GeoChatRequestError('no', null, 401)));

    const { result } = renderHook(() => useDebatePeople(true), { wrapper: retryingWrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(mocks.listDebatePeople).toHaveBeenCalledTimes(1);
  });
});

describe('the rolling calendar availability read', () => {
  it('fetches fresh availability when its local date changes, but not on every render', async () => {
    mocks.listSchedulablePeople
      .mockResolvedValueOnce({ people: [], viewer_has_schedule: false, truncated: false })
      .mockResolvedValueOnce({ people: [], viewer_has_schedule: true, truncated: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const provider = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ calendarDate }) => useSchedulablePeople(true, { calendar: true, calendarDate }),
      { wrapper: provider, initialProps: { calendarDate: '2026-10-07' } }
    );
    await waitFor(() => expect(result.current.data?.viewer_has_schedule).toBe(false));
    rerender({ calendarDate: '2026-10-07' });
    expect(mocks.listSchedulablePeople).toHaveBeenCalledTimes(1);
    rerender({ calendarDate: '2026-10-08' });
    await waitFor(() => expect(result.current.data?.viewer_has_schedule).toBe(true));
    expect(mocks.listSchedulablePeople).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it('fetches through the end of a local fortnight even for a peer far ahead of UTC', async () => {
    mocks.listSchedulablePeople.mockResolvedValue({ people: [], truncated: false });
    const { result } = renderHook(() => useSchedulablePeople(true, { calendar: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const { days } = mocks.listSchedulablePeople.mock.calls[0][0];
    // At 23:30 UTC Oct 7, a viewer in UTC+1 is already on Oct 8: their fortnight ends
    // at 23:00 UTC Oct 21. geo-chat resolves inclusive UTC dates in each peer's zone.
    // A peer in UTC+14 ends their Oct 21 at 10:00 UTC, thirteen hours too early.
    const viewerWindowEnd = Date.parse('2026-10-21T23:00:00Z');
    const peerWindowEnd = zonedWallClockInstant(Date.UTC(2026, 9, 7 + days + 1), 'Pacific/Kiritimati');
    expect(peerWindowEnd.getTime()).toBeGreaterThanOrEqual(viewerWindowEnd);
    expect(days).toBe(CALENDAR_DAYS);
  });
});

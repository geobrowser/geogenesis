import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_SEARCH_QUERY_LENGTH } from '~/core/io/search-query';

import {
  GeoChatRequestError,
  blockDebateUser,
  completeLocalRecordingUpload,
  createDebateRequest,
  dismissDebateRequest,
  endDebateTurn,
  getDebateActivity,
  getGeoChatSession,
  getRematchLiveKitToken,
  joinDebateQueue,
  listDebateClaims,
  listDebatePeople,
  listMatchmakingClaims,
  notifyClaimResponseIndexed,
  resetGeoChatSession,
  retryDebatePhaseBoundaryRequest,
  updateDebateAvailability,
} from './api';

const completeRequest = {
  filename: 'recordings/debate-1/recording.webm',
  mime_type: 'video/webm',
  started_at_ms: 1_000,
  ended_at_ms: 11_000,
  duration_seconds: 10,
  byte_size: 42,
  framerate: 29.97,
};

beforeEach(() => {
  resetGeoChatSession();
  window.localStorage.setItem(
    'geo:chat-session',
    JSON.stringify({
      account_key: 'user-a',
      session: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    })
  );
});

afterEach(() => {
  resetGeoChatSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('geo-chat request errors', () => {
  it('preserves structured API error messages and codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'invalid_recording', message: 'Invalid frame rate' } }), {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(completeLocalRecordingUpload('debate-1', completeRequest, vi.fn(), 'user-a')).rejects.toMatchObject({
      name: 'GeoChatRequestError',
      message: 'Invalid frame rate',
      code: 'invalid_recording',
      status: 400,
    } satisfies Partial<GeoChatRequestError>);
  });

  it('preserves plain-text extraction errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Failed to deserialize the JSON body: framerate must be a number', {
          status: 422,
          statusText: 'Unprocessable Entity',
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    );

    await expect(completeLocalRecordingUpload('debate-1', completeRequest, vi.fn(), 'user-a')).rejects.toMatchObject({
      message: 'Failed to deserialize the JSON body: framerate must be a number',
      code: null,
      status: 422,
    });
  });

  it('falls back to the HTTP status when the error body is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 503,
          statusText: 'Service Unavailable',
        })
      )
    );

    await expect(completeLocalRecordingUpload('debate-1', completeRequest, vi.fn(), 'user-a')).rejects.toMatchObject({
      message: '503 Service Unavailable',
      code: null,
      status: 503,
    });
  });
});

describe('debate phase boundary retries', () => {
  it('retries a readiness error once after the boundary delay', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new GeoChatRequestError('Not ready', 'rematch_not_ready', 400))
      .mockResolvedValueOnce('ready');

    const result = retryDebatePhaseBoundaryRequest(request);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(200);

    await expect(result).resolves.toBe('ready');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated request errors', async () => {
    const error = new GeoChatRequestError('Invalid', 'invalid_recording', 400);
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(retryDebatePhaseBoundaryRequest(request)).rejects.toBe(error);
    expect(request).toHaveBeenCalledOnce();
  });
});

describe('debate availability', () => {
  it('updates the authenticated availability preference', async () => {
    const activity = {
      online: true,
      available_to_debate: false,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: null,
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(activity), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);

    await expect(updateDebateAvailability(false, vi.fn(), 'user-a')).resolves.toEqual(activity);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/me/debate-availability',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ available_to_debate: false }),
      })
    );
  });
});

describe('matchmaking', () => {
  function stubJson(body: unknown) {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('only sends the claim filters that are set', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ search: 'chips', filter: 'debate_now', limit: 20 }, vi.fn(), 'user-a');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/matchmaking/claims?search=chips&filter=debate_now&limit=20',
      expect.objectContaining({ method: 'GET' })
    );
  });

  // GEO-2658. `/matchmaking/claims` has no ceiling on `search` — it trims, escapes the LIKE
  // wildcards and binds — so this is about the same typed string behaving the same way whichever
  // search box it went into, not about staying inside a limit.
  it('caps an over-long claim search the way the other search box does', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ search: 'a'.repeat(250) }, vi.fn(), 'user-a');

    const url = new URL((fetch.mock.calls[0]?.[0] as string) ?? '');
    expect(url.searchParams.get('search')).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
  });

  // The part that is a correctness fix rather than a consistency one: slicing by code unit would
  // cut a surrogate pair in half, and `URLSearchParams` turns a lone surrogate into a replacement
  // character — a query the server can never match.
  it('never cuts an emoji in half on the way out', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ search: '🎉'.repeat(120) }, vi.fn(), 'user-a');

    const sent = new URL((fetch.mock.calls[0]?.[0] as string) ?? '').searchParams.get('search') ?? '';
    expect(sent).not.toContain('\uFFFD');
    expect([...sent]).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
  });

  it('omits the default "all" filter and unset facets', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ filter: 'all', spaceId: null }, vi.fn(), 'user-a');

    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/matchmaking/claims', expect.anything());
  });

  // GEO-2659 and GEO-2674 moved the scope, the topic filter and this session's exclusions onto the
  // wire. Nothing above reaches the URL for them — the UI suites mock the hook and assert the query
  // object — so a renamed or wrongly joined parameter would be caught by neither.
  it('sends the eligible scope, the topic and the session as query parameters', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims(
      { spaceIds: ['space-1', 'space-2'], topicId: 'topic-ai', rematchSessionId: 'rematch-1' },
      vi.fn(),
      'user-a'
    );

    const url = new URL((fetch.mock.calls[0]?.[0] as string) ?? '');
    expect(url.searchParams.get('space_ids')).toBe('space-1,space-2');
    expect(url.searchParams.get('topic_id')).toBe('topic-ai');
    expect(url.searchParams.get('rematch_session_id')).toBe('rematch-1');
  });

  // Same shape as the space pair, and the same reason to send only one.
  it('sends multiple topics as a joined list', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ topicIds: ['topic-ai', 'topic-health'] }, vi.fn(), 'user-a');

    const url = new URL((fetch.mock.calls[0]?.[0] as string) ?? '');
    expect(url.searchParams.get('topic_ids')).toBe('topic-ai,topic-health');
  });

  it('sends the single topic instead of the list, never both', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ topicId: 'topic-ai', topicIds: ['topic-ai', 'topic-health'] }, vi.fn(), 'user-a');

    const url = new URL((fetch.mock.calls[0]?.[0] as string) ?? '');
    expect(url.searchParams.get('topic_id')).toBe('topic-ai');
    expect(url.searchParams.has('topic_ids')).toBe(false);
  });

  it('omits an empty topic list rather than sending it as no filter', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ topicIds: [] }, vi.fn(), 'user-a');

    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/matchmaking/claims', expect.anything());
  });

  // The two space parameters are OR-merged server-side, so sending both would widen the corpus to
  // the whole eligible set the moment the viewer picked one space out of it.
  it('sends the picked space instead of the scope, never both', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ spaceId: 'space-1', spaceIds: ['space-1', 'space-2'] }, vi.fn(), 'user-a');

    const url = new URL((fetch.mock.calls[0]?.[0] as string) ?? '');
    expect(url.searchParams.get('space_id')).toBe('space-1');
    expect(url.searchParams.has('space_ids')).toBe(false);
  });

  // An empty scope means "no space this viewer may be shown claims from", and the server reads a
  // missing `space_ids` as "no filter" — the exact opposite. The callers hold the query back in
  // that case, and this is the half of the contract that makes their doing so necessary.
  it('omits an empty scope rather than sending it as no filter', async () => {
    const fetch = stubJson({ claims: [], next_cursor: null });

    await listMatchmakingClaims({ spaceIds: [] }, vi.fn(), 'user-a');

    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/matchmaking/claims', expect.anything());
  });

  it('creates a debate request for a claim', async () => {
    const fetch = stubJson({ id: 'request-1' });

    await createDebateRequest({ space_id: 'space-1', claim_entity_id: 'claim-1' }, vi.fn(), 'user-a');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/debate-requests',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ space_id: 'space-1', claim_entity_id: 'claim-1' }),
      })
    );
  });

  it('dismisses a request and optionally drops the claim intent', async () => {
    const fetch = stubJson({ request: {}, match: null, debate: null });

    await dismissDebateRequest('request-1', { remove_intent: true }, vi.fn(), 'user-a');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/debate-requests/request-1/dismiss',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ remove_intent: true }) })
    );
  });

  it('blocks a user', async () => {
    const fetch = stubJson({ blocked: [] });

    await blockDebateUser('user-b', vi.fn(), 'user-a');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/me/debate-blocks/user-b',
      expect.objectContaining({ method: 'PUT' })
    );
  });
});

describe('debate queue readiness', () => {
  // The endpoint takes no body at all: a body once meant a client-chosen position, and briefly a
  // `source` discriminator for the legacy/hub split that GEO-2514 removed. geo-chat 426s either.
  it('joins with no body', async () => {
    const response = { claim: { id: 'claim-1' }, match: null };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);

    await expect(joinDebateQueue('space-1', 'claim-1', vi.fn(), 'user-a')).resolves.toEqual(response);

    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/spaces/space-1/claims/claim-1/debate-queue', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
      body: undefined,
      signal: undefined,
    });
  });

  it('surfaces a readiness failure rather than retrying it', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'claim response required', code: 'claim_response_required' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);

    await expect(joinDebateQueue('space-1', 'claim-1', vi.fn(), 'user-a')).rejects.toBeInstanceOf(GeoChatRequestError);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

// GEO-2725 opened both matchmaking reads to signed-out viewers. The risk in doing that is the
// mirror of the case below: a blanket `auth: 'optional'` would also treat a signed-in viewer's
// failed token exchange as "no account" and fetch anonymously, and that answer would be cached
// under their account key — leaving viewer-relative fields like `can_challenge` quietly wrong.
describe('matchmaking read authentication', () => {
  const okResponse = (body: unknown) =>
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );

  beforeEach(() => {
    resetGeoChatSession();
    window.localStorage.removeItem('geo:chat-session');
  });

  it('reads people anonymously when nobody is signed in', async () => {
    const fetch = okResponse({ people: [] });
    vi.stubGlobal('fetch', fetch);

    // Passed but never consulted: with no account there is no exchange to make, which is what
    // keeps this path anonymous rather than merely tokenless.
    const getPrivyIdentityToken = vi.fn();

    await expect(listDebatePeople(getPrivyIdentityToken, null)).resolves.toEqual({ people: [] });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/matchmaking/people',
      expect.objectContaining({ headers: {} })
    );
    expect(getPrivyIdentityToken).not.toHaveBeenCalled();
  });

  it('does not downgrade a signed-in people request to anonymous when the token exchange fails', async () => {
    const fetch = okResponse({ people: [] });
    vi.stubGlobal('fetch', fetch);
    const getPrivyIdentityToken = vi.fn().mockRejectedValue(new Error('Identity token unavailable'));

    await expect(listDebatePeople(getPrivyIdentityToken, 'user-a')).rejects.toThrow('Identity token unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads matchmaking claims anonymously when nobody is signed in', async () => {
    const fetch = okResponse({ claims: [], next_cursor: null });
    vi.stubGlobal('fetch', fetch);

    const getPrivyIdentityToken = vi.fn();

    await expect(listMatchmakingClaims({ filter: 'all' }, getPrivyIdentityToken, null)).resolves.toEqual({
      claims: [],
      next_cursor: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/matchmaking/claims'),
      expect.objectContaining({ headers: {} })
    );
    expect(getPrivyIdentityToken).not.toHaveBeenCalled();
  });

  it('does not downgrade a signed-in claims request to anonymous when the token exchange fails', async () => {
    const fetch = okResponse({ claims: [], next_cursor: null });
    vi.stubGlobal('fetch', fetch);
    const getPrivyIdentityToken = vi.fn().mockRejectedValue(new Error('Identity token unavailable'));

    await expect(listMatchmakingClaims({ filter: 'all' }, getPrivyIdentityToken, 'user-a')).rejects.toThrow(
      'Identity token unavailable'
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('debate claim hydration authentication', () => {
  it('does not silently downgrade a signed-in claim request to anonymous access', async () => {
    resetGeoChatSession();
    window.localStorage.removeItem('geo:chat-session');
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ claims: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);
    const getPrivyIdentityToken = vi.fn().mockRejectedValue(new Error('Identity token unavailable'));

    await expect(listDebateClaims('space-1', ['claim-1'], getPrivyIdentityToken, 'user-a')).rejects.toThrow(
      'Identity token unavailable'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps anonymous claim browsing available without an authorization header', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ claims: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);

    await expect(listDebateClaims('space-1', ['claim-1'])).resolves.toEqual({ claims: [] });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/spaces/space-1/debate-claims?claim_ids=claim-1',
      expect.objectContaining({ headers: {} })
    );
  });
});

describe('rematch voice tokens', () => {
  it('mints a token for the session with an authenticated bodyless POST', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'jwt',
          url: 'wss://livekit.test',
          room_name: 'geo-rematch-session-1',
          participant_slot: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetch);

    await expect(getRematchLiveKitToken('session-1', vi.fn(), 'user-a')).resolves.toEqual({
      token: 'jwt',
      url: 'wss://livekit.test',
      room_name: 'geo-rematch-session-1',
      participant_slot: 2,
    });

    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/debate-rematches/session-1/livekit-token', {
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
      body: undefined,
      signal: undefined,
    });
  });

  // The dock reads the code to decide between rendering nothing and offering a retry, so it has to
  // survive the request layer intact.
  it('surfaces the backend refusal code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'livekit_not_configured', message: 'No LiveKit' } }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(getRematchLiveKitToken('session-1', vi.fn(), 'user-a')).rejects.toMatchObject({
      status: 503,
      code: 'livekit_not_configured',
    });
  });
});

describe('claim response indexing notifications', () => {
  it('posts the indexed response snapshot and accepts an empty success response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      notifyClaimResponseIndexed('space-1', 'claim-1', 'veracity', false, vi.fn(), 'user-a')
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/spaces/space-1/claims/claim-1/response-indexed', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ response_kind: 'veracity', position: false }),
      signal: undefined,
    });
  });

  it('retries transient failures twice before succeeding', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(new Response(null, { status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    const notification = notifyClaimResponseIndexed('space-1', 'claim-1', 'stance', null, vi.fn(), 'user-a');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.runAllTimersAsync();

    await expect(notification).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('stops retrying when the notification is cancelled', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503, statusText: 'Unavailable' }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();

    const notification = notifyClaimResponseIndexed(
      'space-1',
      'claim-1',
      'stance',
      true,
      vi.fn(),
      'user-a',
      controller.signal
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();

    await expect(notification).rejects.toMatchObject({ name: 'AbortError' });
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('turn yields', () => {
  it('posts the client cutoff to the addressed turn', async () => {
    const debate = { id: 'debate-1', status: 'in_progress', turn_yields: [] };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(debate), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);

    await expect(endDebateTurn('debate-1', 2, 1_784_542_272_505, vi.fn(), 'user-a')).resolves.toEqual(debate);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/debates/debate-1/turns/2/end',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ended_at_ms: 1_784_542_272_505 }),
      })
    );
  });
});

describe('geo-chat session sharing', () => {
  it('exposes the fresh session and its expiry to websocket callers', async () => {
    await expect(getGeoChatSession(vi.fn(), 'user-a')).resolves.toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: expect.any(String),
    });
  });

  it('never reuses a stored account when an authenticated request has no current account', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(getDebateActivity(vi.fn(), null)).rejects.toThrow('Sign in to use debates.');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes one session for concurrent callers when expiry is near', async () => {
    window.localStorage.setItem(
      'geo:chat-session',
      JSON.stringify({
        account_key: 'user-a',
        session: {
          access_token: 'stale-access-token',
          refresh_token: 'refresh-token',
          expires_at: new Date(Date.now() + 10_000).toISOString(),
        },
      })
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access-token',
          refresh_token: 'fresh-refresh-token',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetch);

    const [first, second] = await Promise.all([
      getGeoChatSession(vi.fn(), 'user-a'),
      getGeoChatSession(vi.fn(), 'user-a'),
    ]);

    expect(first.access_token).toBe('fresh-access-token');
    expect(second.access_token).toBe('fresh-access-token');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a stored session owned by another account', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'user-b-access-token',
          refresh_token: 'user-b-refresh-token',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      getGeoChatSession(
        vi.fn(async () => 'user-b-identity-token'),
        'user-b'
      )
    ).resolves.toMatchObject({
      access_token: 'user-b-access-token',
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/auth/session',
      expect.objectContaining({ headers: { Authorization: 'Bearer user-b-identity-token' } })
    );
    expect(JSON.parse(window.localStorage.getItem('geo:chat-session')!)).toMatchObject({
      account_key: 'user-b',
      session: { access_token: 'user-b-access-token' },
    });
  });

  it('uses the current account session for authenticated REST requests', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'user-b-access-token',
            refresh_token: 'user-b-refresh-token',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ recording: {}, debate: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetch);

    await completeLocalRecordingUpload(
      'debate-1',
      completeRequest,
      vi.fn(async () => 'user-b-identity-token'),
      'user-b'
    );

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/auth/session',
      expect.objectContaining({ headers: { Authorization: 'Bearer user-b-identity-token' } })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/debates/debate-1/recordings/local-upload-complete',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer user-b-access-token' }) })
    );
  });

  it('retires an in-flight exchange when the account changes', async () => {
    resetGeoChatSession();
    let resolveFirst!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>(resolve => (resolveFirst = resolve)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'user-b-access-token',
            refresh_token: 'user-b-refresh-token',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetch);

    const first = getGeoChatSession(
      vi.fn(async () => 'user-a-identity-token'),
      'user-a'
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = getGeoChatSession(
      vi.fn(async () => 'user-b-identity-token'),
      'user-b'
    );
    await expect(second).resolves.toMatchObject({ access_token: 'user-b-access-token' });

    resolveFirst(
      new Response(
        JSON.stringify({
          access_token: 'user-a-access-token',
          refresh_token: 'user-a-refresh-token',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    await expect(first).rejects.toThrow('Geo Chat session changed');
    expect(JSON.parse(window.localStorage.getItem('geo:chat-session')!)).toMatchObject({
      account_key: 'user-b',
    });
  });

  it('times out a stalled session exchange', async () => {
    resetGeoChatSession();
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? null;
        return new Promise<Response>(() => undefined);
      })
    );

    const result = expect(
      getGeoChatSession(
        vi.fn(async () => 'identity-token'),
        'user-a'
      )
    ).rejects.toThrow('Geo Chat session request timed out.');
    await vi.advanceTimersByTimeAsync(10_000);

    await result;
    expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
  });
});

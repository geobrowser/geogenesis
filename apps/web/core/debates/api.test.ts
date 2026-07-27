import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GeoChatRequestError,
  completeLocalRecordingUpload,
  getDebateActivity,
  getGeoChatSession,
  resetGeoChatSession,
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

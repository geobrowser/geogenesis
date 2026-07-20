import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError, completeLocalRecordingUpload } from './api';

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
  window.localStorage.setItem(
    'geo:chat-session',
    JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
  );
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
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

    await expect(completeLocalRecordingUpload('debate-1', completeRequest, vi.fn())).rejects.toMatchObject({
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

    await expect(completeLocalRecordingUpload('debate-1', completeRequest, vi.fn())).rejects.toMatchObject({
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

    await expect(completeLocalRecordingUpload('debate-1', completeRequest, vi.fn())).rejects.toMatchObject({
      message: '503 Service Unavailable',
      code: null,
      status: 503,
    });
  });
});

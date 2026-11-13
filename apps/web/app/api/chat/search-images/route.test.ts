import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { safeFetch } from '../web-fetch/helpers';

vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => Object.assign(() => ({}), { tools: { webSearch_20250305: () => ({}) } }),
}));
vi.mock('../rate-limit', () => ({
  ipCeilingLimit: { limit: async () => ({ success: true }) },
  loggedInLimit: { limit: async () => ({ success: true }) },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: `0x${'1'.repeat(40)}` }) }) }));
vi.mock('../web-fetch/helpers', async importOriginal => ({
  ...(await importOriginal<typeof import('../web-fetch/helpers')>()),
  safeFetch: vi.fn(),
}));

const { POST } = await import('./route');

const IMAGE_URL = 'https://upload.example.org/eiffel-night.jpg';

function request(signal?: AbortSignal) {
  return new Request('http://localhost/api/chat/search-images', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Eiffel Tower at night' }),
    signal,
  });
}

function rejectWhenAborted(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

function searchFinds(url: string) {
  vi.mocked(generateText).mockResolvedValueOnce({
    steps: [{ toolCalls: [{ toolName: 'emitImages', input: { images: [{ url, title: 'Eiffel Tower' }] } }] }],
  } as unknown as Awaited<ReturnType<typeof generateText>>);
}

afterEach(() => {
  vi.mocked(generateText).mockReset();
  vi.mocked(safeFetch).mockReset();
  vi.restoreAllMocks();
});

describe('search-images route when the client disconnects', () => {
  it('stops the search without reporting a failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateText).mockImplementationOnce(options => rejectWhenAborted(options.abortSignal));
    const client = new AbortController();

    const pending = POST(request(client.signal));
    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));
    const handedToModel = vi.mocked(generateText).mock.calls[0][0].abortSignal;

    client.abort();
    const response = await pending;

    expect(handedToModel?.aborted).toBe(true);
    expect(response.status).toBe(499);
    expect(errors).not.toHaveBeenCalled();
  });

  it('stops while fetching candidates and never starts the verification call', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    searchFinds(IMAGE_URL);
    vi.mocked(safeFetch).mockImplementationOnce((_url, init) => rejectWhenAborted(init?.signal));
    const client = new AbortController();

    const pending = POST(request(client.signal));
    await vi.waitFor(() => expect(safeFetch).toHaveBeenCalledTimes(1));

    client.abort();
    const response = await pending;

    expect(response.status).toBe(499);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('stops during the verification call', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    searchFinds(IMAGE_URL);
    vi.mocked(safeFetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    );
    vi.mocked(generateText).mockImplementationOnce(options => rejectWhenAborted(options.abortSignal));
    const client = new AbortController();

    const pending = POST(request(client.signal));
    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(2));

    client.abort();
    const response = await pending;

    expect(response.status).toBe(499);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('search-images route when verification fails for another reason', () => {
  it('returns the unverified candidates and logs the failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    searchFinds(IMAGE_URL);
    vi.mocked(safeFetch).mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    );
    vi.mocked(generateText).mockRejectedValueOnce(new Error('vision model unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      images: [{ url: IMAGE_URL, title: 'Eiffel Tower', sourceUrl: null, verifyReason: null }],
    });
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

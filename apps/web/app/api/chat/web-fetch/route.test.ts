import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => Object.assign(() => ({}), { tools: { webFetch_20250910: () => ({}) } }),
}));
vi.mock('../cost', () => ({ logCallCost: vi.fn() }));
vi.mock('../rate-limit', () => ({
  ipCeilingLimit: { limit: async () => ({ success: true }) },
  loggedInLimit: { limit: async () => ({ success: true }) },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: `0x${'1'.repeat(40)}` }) }) }));

const { POST } = await import('./route');

function request(url: string, signal?: AbortSignal) {
  return new Request('http://localhost/api/chat/web-fetch', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });
}

function rejectWhenAborted(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

afterEach(() => {
  vi.mocked(generateText).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('web-fetch route when the client disconnects', () => {
  it('stops the page sub-agent without reporting a failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateText).mockImplementationOnce(options => rejectWhenAborted(options.abortSignal));
    const client = new AbortController();

    const pending = POST(request('https://ethereum.org/en/layer-2/', client.signal));
    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));
    const handedToModel = vi.mocked(generateText).mock.calls[0][0].abortSignal;

    client.abort();
    const response = await pending;

    expect(handedToModel?.aborted).toBe(true);
    expect(response.status).toBe(499);
    expect(errors).not.toHaveBeenCalled();
  });

  it('stops a post lookup and does not start the fallback lookup', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => rejectWhenAborted(init?.signal));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AbortController();

    const pending = POST(request('https://x.com/geobrowser/status/1234567890', client.signal));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    client.abort();
    const response = await pending;

    expect(response.status).toBe(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('web-fetch route when the fetch itself fails', () => {
  it('reports the page as not accessible and logs the failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateText).mockRejectedValueOnce(new Error('upstream unavailable'));

    const response = await POST(request('https://ethereum.org/en/layer-2/'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ error: 'not_accessible' });
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('falls back to the second lookup when the first post lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('first lookup down'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            html: '<blockquote><p>Shipping today.</p></blockquote>',
            author_name: 'Geo',
            url: 'https://x.com/geobrowser/status/1234567890',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request('https://x.com/geobrowser/status/1234567890'));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({
      sources: [{ url: 'https://x.com/geobrowser/status/1234567890', title: 'Geo on X' }],
    });
  });
});

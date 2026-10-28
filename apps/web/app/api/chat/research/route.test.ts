import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => Object.assign(() => ({}), { tools: { webSearch_20250305: () => ({}) } }),
}));
vi.mock('../cost', () => ({ logCallCost: vi.fn() }));
vi.mock('../rate-limit', () => ({
  ipCeilingLimit: { limit: async () => ({ success: true }) },
  loggedInLimit: { limit: async () => ({ success: true }) },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: `0x${'1'.repeat(40)}` }) }) }));

const { POST } = await import('./route');

function request(signal?: AbortSignal) {
  return new Request('http://localhost/api/chat/research', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'latest developments in layer 2 scaling' }),
    signal,
  });
}

function holdUntilAborted() {
  vi.mocked(generateText).mockImplementationOnce(
    options =>
      new Promise((_, reject) => {
        options.abortSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      })
  );
}

afterEach(() => {
  vi.mocked(generateText).mockReset();
  vi.restoreAllMocks();
});

describe('research route', () => {
  it('stops the sub-agent when the client disconnects, without reporting a failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    holdUntilAborted();
    const client = new AbortController();

    const pending = POST(request(client.signal));
    await vi.waitFor(() => expect(generateText).toHaveBeenCalledTimes(1));
    const handedToModel = vi.mocked(generateText).mock.calls[0][0].abortSignal;
    expect(handedToModel?.aborted).toBe(false);

    client.abort();
    const response = await pending;

    expect(handedToModel?.aborted).toBe(true);
    expect(response.status).toBe(499);
    expect(errors).not.toHaveBeenCalled();
  });

  it('still reports a failure that was not a disconnect', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateText).mockRejectedValueOnce(new Error('upstream unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('returns the summary when the run completes', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: 'Rollups lowered fees.',
      steps: [{ sources: [{ sourceType: 'url', url: 'https://example.org/l2', title: 'L2 report' }] }],
      totalUsage: {},
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      summary: 'Rollups lowered fees.',
      sources: [{ url: 'https://example.org/l2', title: 'L2 report' }],
    });
  });
});

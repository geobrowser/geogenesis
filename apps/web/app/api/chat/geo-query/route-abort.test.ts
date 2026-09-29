import { generateText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => ({}) }));
vi.mock('../cost', () => ({ logCallCost: vi.fn() }));
vi.mock('../rate-limit', () => ({
  ipCeilingLimit: { limit: async () => ({ success: true }) },
  loggedInLimit: { limit: async () => ({ success: true }) },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: `0x${'1'.repeat(40)}` }) }) }));
vi.mock('~/core/environment/environment', () => ({
  getConfig: () => ({ chainId: '1', rpc: 'https://rpc.example', api: 'https://api.example/graphql' }),
}));

const { POST } = await import('./route');

function request(signal?: AbortSignal) {
  return new Request('http://localhost/api/chat/geo-query', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'How many entities are in the Crypto space?' }),
    signal,
  });
}

afterEach(() => {
  vi.mocked(generateText).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('geo-query route when the client disconnects', () => {
  it('stops the sub-agent without reporting a failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateText).mockImplementationOnce(
      options =>
        new Promise((_, reject) => {
          options.abortSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
            once: true,
          });
        })
    );
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

  it('still reports a failure that was not a disconnect', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(generateText).mockRejectedValueOnce(new Error('upstream unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

describe('geo-query route and the query guard', () => {
  it('refuses the overload shape inside the tool and never calls the API', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    let refusal: unknown;
    let allowed: unknown;
    vi.mocked(generateText).mockImplementationOnce(async options => {
      const run = (query: string) =>
        options.tools!.runQuery.execute!({ query }, { toolCallId: 'runQuery', messages: [] });
      refusal = await run(
        '{ entitiesConnection(first: 1000) { nodes { id relations(first: 1000) { nodes { id } } } } }'
      );
      expect(fetchMock).not.toHaveBeenCalled();
      allowed = await run('{ entitiesConnection(first: 0) { totalCount } }');
      return { text: 'Done.', totalUsage: {} } as unknown as Awaited<ReturnType<typeof generateText>>;
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(refusal).toMatchObject({ error: expect.stringContaining('1000 rows') });
    expect(allowed).toEqual({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await response.json()).queries).toEqual(['{ entitiesConnection(first: 0) { totalCount } }']);
  });
});

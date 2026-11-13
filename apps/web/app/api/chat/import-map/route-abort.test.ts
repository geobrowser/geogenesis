import { generateText } from 'ai';
import * as Effect from 'effect/Effect';
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
vi.mock('~/core/io/queries', () => ({
  getAllEntities: () => Effect.succeed({ entities: [], hasNextPage: false }),
  getEntity: () => Effect.succeed(null),
  getProperties: () => Effect.succeed([]),
  getResults: () => Effect.succeed([]),
}));

const { POST } = await import('./route');
const TYPE = 'a'.repeat(32);
const PROPERTY = 'b'.repeat(32);

function request(signal?: AbortSignal) {
  return new Request('http://localhost/api/chat/import-map', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaceId: 'c'.repeat(32),
      fileName: 'people.csv',
      rowCount: 1,
      columns: [
        { index: 0, header: 'Name', samples: ['Mira'], filled: 1 },
        { index: 1, header: 'Bio', samples: ['Researcher'], filled: 1 },
      ],
      localOntology: {
        types: [{ id: TYPE, name: 'Person' }],
        properties: [{ id: PROPERTY, name: 'Bio', dataType: 'TEXT', relationValueTypes: [] }],
      },
    }),
    signal,
  });
}

afterEach(() => {
  vi.mocked(generateText).mockReset();
  vi.restoreAllMocks();
});

describe('import-map route when the client disconnects', () => {
  it('stops the mapping sub-agent without reporting a failure', async () => {
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

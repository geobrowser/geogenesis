import { generateText } from 'ai';
import * as Effect from 'effect/Effect';
import { describe, expect, it, vi } from 'vitest';

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
const previousMapping = {
  typeId: TYPE,
  typeName: 'Person',
  nameColumn: 0,
  columns: [{ index: 1, kind: 'value', propertyId: PROPERTY, propertyName: 'Bio', coercion: 'text' }],
  summary: 'Bio is mapped.',
};

function request() {
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
      previousMapping,
      hint: 'Skip Bio at the curator’s request.',
      localOntology: {
        types: [{ id: TYPE, name: 'Person' }],
        properties: [{ id: PROPERTY, name: 'Bio', dataType: 'TEXT', relationValueTypes: [] }],
      },
    }),
  });
}

describe('mapping tool sequence', () => {
  it('requires a complete submission before accepting revisions to a previous preview', async () => {
    vi.mocked(generateText).mockImplementationOnce(async options => {
      const tools = options.tools!;
      const call = (name: string, input: unknown) => tools[name].execute!(input, { toolCallId: name, messages: [] });
      const step = async () => {
        const prepare = options.prepareStep!;
        const fn = Array.isArray(prepare) ? prepare[0] : prepare;
        return fn({} as Parameters<typeof fn>[0]);
      };
      const skipped = { index: 1, kind: 'skip', reason: 'The curator asked to skip Bio.' };

      expect((await step())?.activeTools).not.toContain('reconsiderColumns');
      // Reproduce the live failure even if a provider emits an unavailable tool.
      expect(await call('reconsiderColumns', { columns: [skipped] })).toMatchObject({ accepted: false });
      const stop = options.stopWhen!;
      const accepted = Array.isArray(stop) ? stop[0] : stop;
      expect(await accepted({ steps: [] })).toBe(false);

      expect(await call('submitMapping', { ...previousMapping, columns: [skipped] })).toMatchObject({
        accepted: false,
        reconsider: [{ index: 1 }],
      });
      expect((await step())?.activeTools).toContain('reconsiderColumns');
      expect(await call('reconsiderColumns', { columns: [skipped] })).toMatchObject({ accepted: true });
      expect(await accepted({ steps: [] })).toBe(true);
      return { totalUsage: {} } as Awaited<ReturnType<typeof generateText>>;
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      typeId: TYPE,
      nameColumn: 0,
      columns: [{ index: 1, kind: 'skip', reason: 'The curator asked to skip Bio.' }],
    });
  });
});

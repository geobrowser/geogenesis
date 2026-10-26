import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_FRESH_SLOT_CONFIG } from '~/core/explore/fresh-slot/fresh-slot-config';

const mocks = vi.hoisted(() => ({ gate: vi.fn(), store: vi.fn(), compareAndSet: vi.fn() }));

vi.mock('~/core/explore/fresh-slot/ranking-lab-admin', () => ({
  requireRankingLabAdmin: () => mocks.gate(),
}));
vi.mock('~/core/explore/fresh-slot/ranking-params', () => ({
  fetchRankingParams: async () => ({ config: { tauSeconds: '100000' }, typeWeights: [] }),
}));
vi.mock('~/core/explore/fresh-slot/fresh-slot-store', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/explore/fresh-slot/fresh-slot-store')>()),
  upstashFreshSlotStore: () => mocks.store(),
}));

const { GET, POST, PUT } = await import('./route');
const { POST: PREVIEW } = await import('./preview/route');

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const on = { ...DEFAULT_FRESH_SLOT_CONFIG, enabled: true };

function memoryStore() {
  const data = { state: null as string | null, history: [] as string[] };
  return {
    readState: async () => data.state,
    readHistory: async (limit: number) => data.history.slice(0, limit),
    compareAndSet: mocks.compareAndSet.mockImplementation(async (_expected: number, state: unknown, entry: unknown) => {
      data.state = JSON.stringify(state);
      data.history.unshift(JSON.stringify(entry));
      return true;
    }),
  };
}

const put = (body: unknown) =>
  PUT(new Request('https://example.test/api/explore/ranking-lab', { method: 'PUT', body: JSON.stringify(body) }));

beforeEach(() => {
  mocks.gate.mockReset();
  mocks.compareAndSet.mockReset();
  mocks.store.mockReset();
  mocks.store.mockReturnValue(memoryStore());
});

describe('the ranking lab API', () => {
  it.each([
    [401, 'sign_in_required'],
    [403, 'not_admin'],
  ])('refuses with %i before reading or writing anything', async (status, code) => {
    mocks.gate.mockResolvedValue({ ok: false, status, code });

    expect((await GET(new Request('https://example.test/api/explore/ranking-lab'))).status).toBe(status);
    expect((await put({ config: on, baseRevision: 0 })).status).toBe(status);
    expect(
      (
        await POST(
          new Request('https://example.test/api/explore/ranking-lab', {
            method: 'POST',
            body: JSON.stringify({ action: 'rollback', toRevision: 1, baseRevision: 0 }),
          })
        )
      ).status
    ).toBe(status);
    expect(
      (
        await PREVIEW(
          new Request('https://example.test/api/explore/ranking-lab/preview', {
            method: 'POST',
            body: JSON.stringify({ config: on }),
          })
        )
      ).status
    ).toBe(status);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.compareAndSet).not.toHaveBeenCalled();
  });

  it('saves as the verified admin, and reads it back with its history', async () => {
    mocks.gate.mockResolvedValue({ ok: true, admin: { spaceId: ADMIN, geoChatUserId: null } });

    const saved = await put({ config: on, baseRevision: 0 });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ state: { revision: 1, updatedBy: ADMIN, config: on } });

    const read = await (await GET(new Request('https://example.test/api/explore/ranking-lab'))).json();
    expect(read).toMatchObject({
      storeConfigured: true,
      state: { revision: 1, config: on },
      history: [{ revision: 1, by: ADMIN, action: 'save' }],
      rankingParams: { config: { tauSeconds: '100000' } },
    });
  });

  it('rejects a malformed save', async () => {
    mocks.gate.mockResolvedValue({ ok: true, admin: { spaceId: ADMIN, geoChatUserId: null } });
    expect((await put({ config: on })).status).toBe(400);
    expect((await put({ config: { enabled: 'yes' }, baseRevision: 0 })).status).toBe(400);
    expect(mocks.compareAndSet).not.toHaveBeenCalled();
  });

  it('says so when the store is not configured', async () => {
    mocks.gate.mockResolvedValue({ ok: true, admin: { spaceId: ADMIN, geoChatUserId: null } });
    mocks.store.mockReturnValue(null);
    expect((await put({ config: on, baseRevision: 0 })).status).toBe(503);
    expect(await (await GET(new Request('https://example.test/api/explore/ranking-lab'))).json()).toMatchObject({
      storeConfigured: false,
    });
  });
});

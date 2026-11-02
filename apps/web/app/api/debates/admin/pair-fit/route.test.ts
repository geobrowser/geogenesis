import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ gate: vi.fn(), gaia: vi.fn() }));

vi.mock('~/core/explore/fresh-slot/ranking-lab-admin', () => ({
  requireRankingLabAdmin: () => mocks.gate(),
}));
vi.mock('~/core/debates/server/gaia-pair-fit', () => ({
  fetchGaiaPairFit: (args: unknown) => mocks.gaia(args),
}));

const { POST } = await import('./route');

const ADMIN = { ok: true, admin: { spaceId: 'a'.repeat(32), geoChatUserId: null } };
const USER = '0f0f3224-0000-4000-8000-000000000001';
const CANDIDATE = 'b'.repeat(32);

const post = (body: unknown) =>
  POST(new Request('https://example.test/api/debates/admin/pair-fit', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  mocks.gate.mockReset();
  mocks.gaia.mockReset();
});

describe('the New match pair fit API', () => {
  it.each([
    [401, 'sign_in_required'],
    [403, 'not_admin'],
  ])('refuses with %i before asking gaia anything', async (status, code) => {
    mocks.gate.mockResolvedValue({ ok: false, status, code });
    const response = await post({ userId: USER, candidateIds: [CANDIDATE] });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    expect(mocks.gaia).not.toHaveBeenCalled();
  });

  it('asks gaia for the admin, with normalized ids and without debater 1 among the candidates', async () => {
    mocks.gate.mockResolvedValue(ADMIN);
    mocks.gaia.mockResolvedValue([{ userId: CANDIDATE, score: 0.4 }]);
    const response = await post({ userId: USER, candidateIds: [CANDIDATE, USER, CANDIDATE.toUpperCase()] });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ available: true, items: [{ userId: CANDIDATE, score: 0.4 }] });
    expect(mocks.gaia).toHaveBeenCalledWith({ userId: USER.replaceAll('-', ''), candidateIds: [CANDIDATE] });
  });

  it('says unavailable when gaia is unset or down, so the dialog keeps its order', async () => {
    mocks.gate.mockResolvedValue(ADMIN);
    mocks.gaia.mockResolvedValue(null);
    expect(await (await post({ userId: USER, candidateIds: [CANDIDATE] })).json()).toEqual({
      available: false,
      items: [],
    });
  });

  it('rejects a malformed body', async () => {
    mocks.gate.mockResolvedValue(ADMIN);
    expect((await post({ userId: 'nope', candidateIds: [] })).status).toBe(400);
    expect((await post({ userId: USER, candidateIds: ['nope'] })).status).toBe(400);
    expect((await post({ userId: USER })).status).toBe(400);
    expect(
      (
        await post({
          userId: USER,
          candidateIds: Array.from({ length: 301 }, (_, i) => i.toString(16).padStart(32, '0')),
        })
      ).status
    ).toBe(400);
    expect(mocks.gaia).not.toHaveBeenCalled();
  });
});

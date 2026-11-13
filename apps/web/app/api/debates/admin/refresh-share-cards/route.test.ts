import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ gate: vi.fn(), refresh: vi.fn() }));

vi.mock('~/core/explore/fresh-slot/ranking-lab-admin', () => ({
  requireRankingLabAdmin: () => mocks.gate(),
}));
vi.mock('~/core/debates/server/refresh-debate-share-cards', () => ({
  refreshDebateShareCards: (...args: unknown[]) => mocks.refresh(...args),
}));

const { POST } = await import('./route');

const ADMIN_SPACE = 'a'.repeat(32);
const ADMIN = { ok: true, admin: { spaceId: ADMIN_SPACE, geoChatUserId: null } };
const DEBATE = '01a1d0d5-7658-7fc0-9bff-000000000001';

const post = (body: unknown) =>
  POST(
    new Request('https://example.test/api/debates/admin/refresh-share-cards', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.gate.mockReset();
  mocks.refresh.mockReset();
  vi.stubEnv('DEBATE_ACCEPTOR_ADMIN_SPACE_IDS', ADMIN_SPACE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the share card redraw API', () => {
  it.each([
    [401, 'sign_in_required'],
    [403, 'not_admin'],
  ])('refuses with %i before reading anything', async (status, code) => {
    mocks.gate.mockResolvedValue({ ok: false, status, code });
    const response = await post({ debateIds: [DEBATE], reason: 'r' });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('refuses an admin who may not sign as the acceptor', async () => {
    mocks.gate.mockResolvedValue({ ok: true, admin: { spaceId: 'b'.repeat(32), geoChatUserId: null } });
    const response = await post({ debateIds: [DEBATE], reason: 'r' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not_acceptor_admin' });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    mocks.gate.mockResolvedValue(ADMIN);
    expect((await post('{')).status).toBe(400);
    const response = await post({ debateIds: [DEBATE] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'reason_required' });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('dry-runs by default and returns the results and what is left', async () => {
    mocks.gate.mockResolvedValue(ADMIN);
    mocks.refresh.mockResolvedValue({
      status: 'ran',
      results: [{ debateId: DEBATE, status: 'dry_run' }],
      unprocessed: [],
      acceptorBusy: false,
    });
    const response = await post({ debateIds: [DEBATE], reason: 'GEO-3722' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      apply: false,
      results: [{ debateId: DEBATE, status: 'dry_run' }],
      unprocessed: [],
    });
    expect(mocks.refresh).toHaveBeenCalledWith([DEBATE], { apply: false });
  });

  it('answers 409 when the signing lock was busy, still listing what ran and what is left', async () => {
    mocks.gate.mockResolvedValue(ADMIN);
    mocks.refresh.mockResolvedValue({ status: 'ran', results: [], unprocessed: [DEBATE], acceptorBusy: true });
    const response = await post({ debateIds: [DEBATE], apply: true, reason: 'r' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'acceptor_busy', apply: true, results: [], unprocessed: [DEBATE] });
    expect(mocks.refresh).toHaveBeenCalledWith([DEBATE], { apply: true });
  });

  it('answers 503 when the acceptor is not configured', async () => {
    mocks.gate.mockResolvedValue(ADMIN);
    mocks.refresh.mockResolvedValue({ status: 'acceptor_not_configured' });
    const response = await post({ debateIds: [DEBATE], apply: true, reason: 'r' });
    expect(response.status).toBe(503);
  });
});

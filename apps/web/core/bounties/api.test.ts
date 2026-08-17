import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CuratorApiError,
  CuratorApiUnavailableError,
  createPayoutCredit,
  getSpaceMetrics,
  markSubmissionPaid,
  validateBountyAllocation,
} from './api';

const BASE = 'https://curator.example.com';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('curator api client', () => {
  it('throws CuratorApiUnavailableError when no base URL is configured', async () => {
    await expect(getSpaceMetrics('space-1', { baseUrl: null })).rejects.toBeInstanceOf(CuratorApiUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GETs public endpoints without auth and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(ok({ balance: 4200, totalPaidOut: 100 }));
    const metrics = await getSpaceMetrics('52c7ae14-9838-b6d4-7ce0-f3b2a5974546', { baseUrl: BASE });
    expect(metrics).toEqual({ balance: 4200, totalPaidOut: 100 });
    const [url, init] = fetchMock.mock.calls[0];
    // Path ids are dashless.
    expect(url).toBe(`${BASE}/space/52c7ae149838b6d47ce0f3b2a5974546`);
    expect((init?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('sends the Privy identity token as a Bearer header and normalizes payload ids', async () => {
    fetchMock.mockResolvedValue(ok({ ok: true }));
    await validateBountyAllocation(
      { spaceId: 'AAAA0000-0000-0000-0000-000000000001', bountyId: 'b', allocatedPersonId: 'p' },
      { baseUrl: BASE, getToken: async () => 'jwt-123' }
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/user/bounty-allocation/validate`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer jwt-123');
    expect(JSON.parse(init?.body as string)).toEqual({
      spaceId: 'aaaa0000000000000000000000000001',
      bountyId: 'b',
      allocatedPersonId: 'p',
    });
  });

  it('refuses authenticated calls without a token before hitting the network', async () => {
    await expect(
      createPayoutCredit(
        { spaceId: 's', amount: 10, bountyId: 'b', payoutEntityId: 'pe', recipientEntityId: 'r' },
        { baseUrl: BASE, getToken: async () => null }
      )
    ).rejects.toMatchObject({ status: 401, code: 'no_identity_token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rounds payout amounts to whole points', async () => {
    fetchMock.mockResolvedValue(ok({ success: true, newBalance: 1, newTotalPaidOut: 2 }));
    await createPayoutCredit(
      { spaceId: 's', amount: 199.6, bountyId: 'b', payoutEntityId: 'pe', recipientEntityId: 'r' },
      { baseUrl: BASE, getToken: async () => 't' }
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).amount).toBe(200);
  });

  it('surfaces backend errors as CuratorApiError with status, message and tag', async () => {
    fetchMock.mockResolvedValue(ok({ _tag: 'AuthorizationError', message: 'Not an editor' }, 403));
    const error = await markSubmissionPaid(
      {
        spaceId: 's',
        bountyId: 'b',
        submissionKey: 'k',
        creatorEntityId: 'c',
        firstProposalId: 'p1',
        proposalIds: ['p1'],
        lastActiveAt: '2026-08-14T00:00:00Z',
      },
      { baseUrl: BASE, getToken: async () => 't' }
    ).catch(e => e);
    expect(error).toBeInstanceOf(CuratorApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'AuthorizationError',
      message: 'Not an editor',
      isAuthError: true,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/space/s/bounty/b/submission-lifecycle/paid`);
  });

  it('maps network failures to a retryable status-0 error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await getSpaceMetrics('s', { baseUrl: BASE }).catch(e => e);
    expect(error).toMatchObject({ status: 0, code: 'network', isRetryable: true });
  });
});

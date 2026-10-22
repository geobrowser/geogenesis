import { describe, expect, it, vi } from 'vitest';

import { PayoutCreditError, fetchSpaceBalance, isRetryableCreditError, recordPayoutCredit } from './payout-credit';

const input = {
  spaceId: '3be38bb9-22bc-80c6-a650-3fbbba28d2b0',
  bountyId: '020aefb3b2aa4156a3812e42f991f9a3',
  payoutEntityId: 'aaaa0000000000000000000000000001',
  recipientEntityId: 'b30570f0d43db28e6582e57eb9d5267c',
  amount: 250.4,
  identityToken: 'jwt',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noWait = () => Promise.resolve();

describe('recordPayoutCredit', () => {
  it("posts curator-app's payload to the space's payout endpoint with the editor's token", async () => {
    const fetchImpl = vi.fn(async () => json(200, { success: true, newBalance: 6630, newTotalPaidOut: 44350 }));
    await expect(recordPayoutCredit(input, { fetchImpl, wait: noWait })).resolves.toEqual({ newBalance: 6630 });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://curator-api-testnet.geobrowser.io/space/3be38bb922bc80c6a6503fbbba28d2b0/payout');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt');
    expect(JSON.parse(init.body as string)).toEqual({
      amount: 250,
      bountyId: '020aefb3b2aa4156a3812e42f991f9a3',
      payoutEntityId: 'aaaa0000000000000000000000000001',
      recipientEntityId: 'b30570f0d43db28e6582e57eb9d5267c',
    });
  });

  it('retries a 5xx (the backend may not see the new payout yet) and succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(500, { message: 'not indexed' }))
      .mockResolvedValueOnce(json(200, { newBalance: 1 }));
    await expect(recordPayoutCredit(input, { fetchImpl, wait: noWait })).resolves.toEqual({ newBalance: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx and surfaces its message', async () => {
    const fetchImpl = vi.fn(async () => json(403, { message: 'Only space editors can create payouts' }));
    await expect(recordPayoutCredit(input, { fetchImpl, wait: noWait })).rejects.toThrow(
      'Only space editors can create payouts'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after four attempts on a network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(recordPayoutCredit(input, { fetchImpl, wait: noWait })).rejects.toThrow('Failed to fetch');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('treats only 4xx as final', () => {
    expect(isRetryableCreditError(new PayoutCreditError('x', 400))).toBe(false);
    expect(isRetryableCreditError(new PayoutCreditError('x', 502))).toBe(true);
    expect(isRetryableCreditError(new TypeError('offline'))).toBe(true);
  });
});

describe('fetchSpaceBalance', () => {
  it("reads the space's balance", async () => {
    const fetchImpl = vi.fn(async () => json(200, { balance: 6880, totalPaidOut: 44100 }));
    await expect(fetchSpaceBalance('3be38bb922bc80c6a6503fbbba28d2b0', fetchImpl)).resolves.toBe(6880);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://curator-api-testnet.geobrowser.io/space/3be38bb922bc80c6a6503fbbba28d2b0'
    );
  });

  it('returns null when the ledger is unreachable or errors', async () => {
    await expect(
      fetchSpaceBalance(
        's',
        vi.fn(async () => json(500, {}))
      )
    ).resolves.toBeNull();
    await expect(
      fetchSpaceBalance(
        's',
        vi.fn(async () => {
          throw new Error('offline');
        })
      )
    ).resolves.toBeNull();
  });
});

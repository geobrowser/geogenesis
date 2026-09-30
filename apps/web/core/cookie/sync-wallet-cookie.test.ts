import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SYNC_RETRY_DELAYS_MS, forgetSyncedWalletCookie, syncWalletCookie } from './sync-wallet-cookie';

const onConnectionChange = vi.hoisted(() => vi.fn<(args: unknown) => Promise<string | null>>());
const getToken = vi.hoisted(() => vi.fn<() => Promise<string | null>>());
const setCachedToken = vi.hoisted(() => vi.fn<(token: string | null) => void>());

vi.mock('./cookie', () => ({ onConnectionChange }));
vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: getToken,
  setCachedIdentityToken: setCachedToken,
}));

const ADDRESS = '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e';
const OTHER = '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4';

describe('syncWalletCookie', () => {
  beforeEach(() => {
    forgetSyncedWalletCookie();
    onConnectionChange.mockReset();
    getToken.mockReset();
    setCachedToken.mockReset();
    getToken.mockResolvedValue('identity-token');
    // The server answers with whatever wallet the token vouches for; here, the one asked about.
    onConnectionChange.mockImplementation(async () => ADDRESS);
  });

  it('sends the identity token, not the address', async () => {
    await syncWalletCookie(ADDRESS);

    expect(onConnectionChange).toHaveBeenCalledWith({ type: 'connect', identityToken: 'identity-token' });
  });

  // The smart-account query refetches on every stale mount; each call is a Server Action round
  // trip, which fails outright in a tab left open across a deploy.
  it('does not call the action again for an address the server already recognised', async () => {
    await syncWalletCookie(ADDRESS);
    await syncWalletCookie(ADDRESS);
    await syncWalletCookie(ADDRESS.toLowerCase() as `0x${string}`);

    expect(onConnectionChange).toHaveBeenCalledTimes(1);
  });

  it('calls the action when the address changes', async () => {
    await syncWalletCookie(ADDRESS);
    onConnectionChange.mockImplementation(async () => OTHER);
    await syncWalletCookie(OTHER);

    expect(onConnectionChange).toHaveBeenCalledTimes(2);
  });

  it('calls the action again for the same address after the wallet went away', async () => {
    await syncWalletCookie(ADDRESS);
    forgetSyncedWalletCookie();
    await syncWalletCookie(ADDRESS);

    expect(onConnectionChange).toHaveBeenCalledTimes(2);
  });

  it('retries on the next run when the action failed', async () => {
    onConnectionChange.mockRejectedValueOnce(new Error('Server Action was not found on the server'));

    await expect(syncWalletCookie(ADDRESS)).rejects.toThrow();
    await syncWalletCookie(ADDRESS);

    expect(onConnectionChange).toHaveBeenCalledTimes(2);
  });

  it('waits for a token rather than calling without one, and tries again next run', async () => {
    getToken.mockResolvedValueOnce(null);

    await syncWalletCookie(ADDRESS);
    expect(onConnectionChange).not.toHaveBeenCalled();

    await syncWalletCookie(ADDRESS);
    expect(onConnectionChange).toHaveBeenCalledTimes(1);
  });

  it('retries when the server recognised a different wallet than this tab is using', async () => {
    onConnectionChange.mockImplementationOnce(async () => OTHER);

    await syncWalletCookie(ADDRESS);
    await syncWalletCookie(ADDRESS);

    expect(onConnectionChange).toHaveBeenCalledTimes(2);
  });

  it('retries when the server recognised no wallet', async () => {
    onConnectionChange.mockImplementationOnce(async () => null);

    await syncWalletCookie(ADDRESS);
    await syncWalletCookie(ADDRESS);

    expect(onConnectionChange).toHaveBeenCalledTimes(2);
  });

  // Nothing else re-runs the sync when the token shows up: the smart-account query is keyed on
  // wallet addresses. Without a retry an idle tab stayed unrecognised by the server.
  describe('retry without a smart-account refetch', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('syncs once the token shows up', async () => {
      getToken.mockResolvedValueOnce(null);

      await syncWalletCookie(ADDRESS);
      expect(onConnectionChange).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
      expect(onConnectionChange).toHaveBeenCalledTimes(1);

      // Recognised now, so nothing further is scheduled.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(onConnectionChange).toHaveBeenCalledTimes(1);
    });

    it('retries when the server recognised no wallet', async () => {
      onConnectionChange.mockImplementationOnce(async () => null);

      await syncWalletCookie(ADDRESS);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);

      expect(onConnectionChange).toHaveBeenCalledTimes(2);
    });

    it('stops after the last delay', async () => {
      getToken.mockResolvedValue(null);

      await syncWalletCookie(ADDRESS);
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(getToken).toHaveBeenCalledTimes(1 + SYNC_RETRY_DELAYS_MS.length);
    });

    // After an account switch the shared token cache can still hold the previous account's token,
    // which the server rightly verifies as that account. Retrying with the same token would repeat it.
    it("drops a token that verified as another wallet, and retries with this account's", async () => {
      getToken.mockResolvedValueOnce('previous-account-token').mockResolvedValue('this-account-token');
      onConnectionChange.mockImplementationOnce(async () => OTHER);

      await syncWalletCookie(ADDRESS);
      expect(setCachedToken).toHaveBeenCalledWith(null);

      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
      expect(onConnectionChange).toHaveBeenLastCalledWith({ type: 'connect', identityToken: 'this-account-token' });

      // Recognised now, so settled.
      await syncWalletCookie(ADDRESS);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(onConnectionChange).toHaveBeenCalledTimes(2);
    });

    it('still stops after the last delay when every answer names another wallet', async () => {
      onConnectionChange.mockImplementation(async () => OTHER);

      await syncWalletCookie(ADDRESS);
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(onConnectionChange).toHaveBeenCalledTimes(1 + SYNC_RETRY_DELAYS_MS.length);
    });

    it('keeps the shared token cache when the answer was just unverifiable', async () => {
      onConnectionChange.mockImplementationOnce(async () => null);

      await syncWalletCookie(ADDRESS);

      expect(setCachedToken).not.toHaveBeenCalled();
    });

    it('keeps one retry pending however often it is asked, and retries the latest address', async () => {
      getToken.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      onConnectionChange.mockImplementation(async () => OTHER);

      await syncWalletCookie(ADDRESS);
      await syncWalletCookie(OTHER);
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);

      expect(onConnectionChange).toHaveBeenCalledTimes(1);
      // Recognised as OTHER, which is what the retry asked about, so it is remembered.
      await syncWalletCookie(OTHER);
      expect(onConnectionChange).toHaveBeenCalledTimes(1);
    });

    // Every mounted smart-account consumer can ask at once. One pending retry, on its own schedule,
    // keeps that from becoming a burst of Server Actions.
    it('does not start a second retry schedule for repeated asks', async () => {
      getToken.mockResolvedValue(null);

      await syncWalletCookie(ADDRESS);
      await syncWalletCookie(ADDRESS);
      await syncWalletCookie(ADDRESS);
      expect(getToken).toHaveBeenCalledTimes(3);

      // The first retry is due at the first delay; the next only one delay after that.
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0] + SYNC_RETRY_DELAYS_MS[1] - 1);
      expect(getToken).toHaveBeenCalledTimes(4);
    });

    it('cancels a pending retry when the wallet goes away', async () => {
      getToken.mockResolvedValueOnce(null);

      await syncWalletCookie(ADDRESS);
      forgetSyncedWalletCookie();
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(onConnectionChange).not.toHaveBeenCalled();
    });
  });

  describe('when the wallet goes away', () => {
    it('drops the cached identity token, which belonged to the account that left', async () => {
      await syncWalletCookie(ADDRESS);
      setCachedToken.mockClear();

      forgetSyncedWalletCookie();

      expect(setCachedToken).toHaveBeenCalledWith(null);
    });

    it('leaves the cache alone for a tab that never had a wallet', () => {
      forgetSyncedWalletCookie();

      expect(setCachedToken).not.toHaveBeenCalled();
    });
  });
});

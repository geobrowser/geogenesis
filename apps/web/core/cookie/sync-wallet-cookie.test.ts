import { beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetSyncedWalletCookie, syncWalletCookie } from './sync-wallet-cookie';

const onConnectionChange = vi.hoisted(() => vi.fn<(args: unknown) => Promise<string | null>>());
const getToken = vi.hoisted(() => vi.fn<() => Promise<string | null>>());

vi.mock('./cookie', () => ({ onConnectionChange }));
vi.mock('~/core/auth/identity-token', () => ({ getCachedIdentityToken: getToken }));

const ADDRESS = '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e';
const OTHER = '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4';

describe('syncWalletCookie', () => {
  beforeEach(() => {
    forgetSyncedWalletCookie();
    onConnectionChange.mockReset();
    getToken.mockReset();
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
});

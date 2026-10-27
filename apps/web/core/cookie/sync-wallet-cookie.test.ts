import { beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetSyncedWalletCookie, syncWalletCookie } from './sync-wallet-cookie';

const onConnectionChange = vi.hoisted(() => vi.fn(async () => null));

vi.mock('./cookie', () => ({ onConnectionChange }));

const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

describe('syncWalletCookie', () => {
  beforeEach(() => {
    forgetSyncedWalletCookie();
    onConnectionChange.mockReset();
    onConnectionChange.mockResolvedValue(null);
  });

  // The smart-account query refetches on every stale mount; each call is a Server Action round
  // trip, which fails outright in a tab left open across a deploy.
  it('does not call the action again for an address it already sent', async () => {
    await syncWalletCookie(ADDRESS);
    await syncWalletCookie(ADDRESS);

    expect(onConnectionChange).toHaveBeenCalledTimes(1);
    expect(onConnectionChange).toHaveBeenCalledWith({ type: 'connect', address: ADDRESS });
  });

  it('calls the action when the address changes', async () => {
    await syncWalletCookie(ADDRESS);
    await syncWalletCookie(OTHER);

    expect(onConnectionChange).toHaveBeenCalledTimes(2);
    expect(onConnectionChange).toHaveBeenLastCalledWith({ type: 'connect', address: OTHER });
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
});

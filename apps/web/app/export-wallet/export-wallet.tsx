'use client';

import { usePrivy } from '~/core/wallet/auth-hooks';
import { accountHasEmbeddedWallet } from '~/core/wallet/embedded-wallet';

import { Button } from '~/design-system/button';

export function ExportWalletButton() {
  const { ready, authenticated, user, exportWallet } = usePrivy();
  const isAuthenticated = ready && authenticated;
  const hasEmbeddedWallet = accountHasEmbeddedWallet(user);

  return (
    <Button onClick={exportWallet} disabled={!isAuthenticated || !hasEmbeddedWallet}>
      Export Wallet
    </Button>
  );
}

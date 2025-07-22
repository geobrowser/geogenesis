'use client';

import { usePrivy } from '@privy-io/react-auth';

import { Button } from '~/design-system/button';

export function ExportWalletButton() {
  const { ready, authenticated, user, exportWallet } = usePrivy();
  const isAuthenticated = ready && authenticated;
  // check that your user has an embedded wallet
  const hasEmbeddedWallet = !!user?.linkedAccounts.find(
    account => account.type === 'wallet' && account.walletClientType === 'privy' && account.chainType === 'ethereum'
  );

  return (
    <Button onClick={exportWallet} disabled={!isAuthenticated || !hasEmbeddedWallet}>
      Export Wallet
    </Button>
  );
}

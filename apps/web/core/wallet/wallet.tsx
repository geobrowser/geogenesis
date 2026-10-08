'use client';

import { WagmiProvider } from '@geogenesis/auth';
import { createGeoWalletConfig, createMockConfig } from '@geogenesis/auth/wallet';

import * as React from 'react';

import { Button, PILL_BUTTON_CLASS_NAME } from '~/design-system/button';

import { Environment } from '../environment';
import { usePrepareOnboarding } from '../hooks/use-prepare-onboarding';
import { usePrivySignIn } from '../hooks/use-privy-sign-in';
import { useTrackedLogin } from '../hooks/use-tracked-login';
import { saveVotesSignInProperties } from '../save-votes-analytics';
import { clearSaveRequested, markSaveRequested, useLocalVoteCount } from '../state/local-votes';
import { GEOGENESIS } from './geo-chain';

const isTestEnv = Environment.variables.isTestEnv;

// Chain identity comes from the shared env-driven config (see
// ~/core/wallet/geo-chain), never a hardcoded network literal.
const CHAIN = GEOGENESIS;

const realWalletConfig = createGeoWalletConfig({
  chain: CHAIN,
  rpcUrl: Environment.getConfig().rpc,
  walletConnectProjectId: Environment.variables.walletConnectProjectId,
});

const mockConfig = createMockConfig(CHAIN);

const activeConfig = isTestEnv ? mockConfig : realWalletConfig;

const config = activeConfig as unknown as React.ComponentProps<typeof WagmiProvider>['config'];

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider reconnectOnMount config={config}>
      {children}
    </WagmiProvider>
  );
}

function PrivyConnectButton() {
  // `null` rather than the current path: this button is a sign-in from anywhere in the app, not a
  // return to anywhere in particular, and a stale path here would send the next person somewhere
  // they never were.
  const prepareOnboarding = usePrepareOnboarding();

  const { login } = useTrackedLogin({});
  // With votes waiting on this device, this is a save prompt (GEO-3214): it names them, and the
  // sign-in it starts saves them. Returns to this page, since the votes were cast here.
  const localVoteCount = useLocalVoteCount();
  const saveSignIn = usePrivySignIn();

  const onLogin = () => {
    if (localVoteCount > 0) {
      markSaveRequested();
      void saveSignIn(saveVotesSignInProperties('navbar', localVoteCount), { onCancel: clearSaveRequested });
      return;
    }
    prepareOnboarding({ returnTo: null });
    login({ component: 'navbar', auth_control: 'sign_in', auth_intent: 'sign_in' });
  };

  return (
    <Button variant="primary" className={PILL_BUTTON_CLASS_NAME} onClick={onLogin}>
      {localVoteCount === 0 ? 'Log in' : localVoteCount === 1 ? 'Save 1 vote' : `Save ${localVoteCount} votes`}
    </Button>
  );
}

export function GeoConnectButton() {
  return <PrivyConnectButton />;
}

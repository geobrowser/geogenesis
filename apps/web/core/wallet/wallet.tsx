'use client';

import { WagmiProvider, useGeoLogin } from '@geogenesis/auth';
import { createGeoWalletConfig, createMockConfig } from '@geogenesis/auth/wallet';

import * as React from 'react';

import { Button } from '~/design-system/button';

import { trackPrivyAuth } from '../analytics';
import { Environment } from '../environment';
import { usePrepareOnboarding } from '../hooks/use-prepare-onboarding';
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

  // Reset is done on the explicit sign-in click below. Doing it here too
  // would wipe the user's in-progress onboarding state if Privy fires
  // onComplete on session restoration (e.g. when opening a new tab), which
  // then syncs the cleared atoms back to the original tab via localStorage.
  // Armed, the way `usePrivySignIn` arms its own. Privy fires `onComplete` on session restoration
  // too — opening a second tab is enough — so tracking unconditionally reported every restore as a
  // manual login. It also meant this button was the *only* thing recording logins started
  // elsewhere, which hid a real gap: whenever `navbar-actions.tsx` is showing its loading skeleton
  // instead of this button, nothing recorded them at all.
  const requestedRef = React.useRef(false);

  const { login } = useGeoLogin({
    onComplete: args => {
      if (!requestedRef.current) return;
      requestedRef.current = false;
      trackPrivyAuth(args, { auth_flow: 'manual_login' });
    },
    onError: () => {
      requestedRef.current = false;
    },
  });

  const onLogin = () => {
    prepareOnboarding({ returnTo: null });
    requestedRef.current = true;
    login();
  };

  // Match the adjacent Debate button's 28px mobile height so the restored account action does not
  // make the navbar taller or visually dominate the other compact controls.
  return (
    <Button className="mobile:h-7 mobile:py-0" onClick={onLogin}>
      Log in
    </Button>
  );
}

export function GeoConnectButton() {
  return <PrivyConnectButton />;
}

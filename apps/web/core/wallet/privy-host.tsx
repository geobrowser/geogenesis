'use client';

import {
  useAccountEffect,
  useGeoLogin,
  useIdentityToken,
  useLoginWithEmail,
  useLoginWithOAuth,
  useLogout,
  usePrivy,
  usePrivyLogin,
  useWalletClient,
  useWallets,
} from '@geogenesis/auth';

import * as React from 'react';

import { ReactQueryProvider } from '../query-client';
import { type InstanceEntry, getInstance, getState, publish, publishInstanceResult, subscribe } from './auth-store';
import { EmbeddedWalletSync } from './embedded-wallet-sync';
import { PrivyProvider } from './privy';
import { WalletProvider } from './wallet-provider';

/**
 * Everything that needs Privy, wagmi or the wallet connectors, in one chunk loaded by `auth-root.tsx`.
 * Nothing outside this file's own imports may import `@geogenesis/auth` by value, or that chunk
 * ends up in the main bundle again.
 *
 * Mounted as a sibling of the app, not around it. Its hooks run here, and `Bridge` publishes what
 * they return into `auth-store.ts`, where `auth-hooks.ts` hands it to the app.
 */
export default function PrivyHost() {
  return (
    <PrivyProvider>
      <ReactQueryProvider>
        <WalletProvider>
          <EmbeddedWalletSync />
          <Bridge />
        </WalletProvider>
      </ReactQueryProvider>
    </PrivyProvider>
  );
}

function Bridge() {
  const privy = usePrivy();
  const wallets = useWallets();
  const identityToken = useIdentityToken();
  const walletClient = useWalletClient();

  // After render, never during it. `publish` is quiet when nothing changed.
  React.useEffect(() => {
    publish('privy', privy);
    publish('wallets', wallets);
    publish('identityToken', identityToken);
    publish('walletClient', walletClient);
  });

  const instanceIds = React.useSyncExternalStore(
    subscribe,
    () => getState().instanceIds,
    () => getState().instanceIds
  );

  return (
    <>
      {instanceIds.map(id => (
        <Instance key={id} id={id} />
      ))}
    </>
  );
}

/** Params the caller handed `auth-hooks`, read when an event fires so they are never stale. */
function useDelegatingParams(entry: InstanceEntry) {
  return entry.params as { current: Record<string, ((...args: unknown[]) => unknown) | undefined> | undefined };
}

function useDelegate(entry: InstanceEntry, name: string) {
  const params = useDelegatingParams(entry);
  return React.useCallback((...args: unknown[]) => params.current?.[name]?.(...args), [params, name]);
}

function usePublishResult(id: string, value: unknown) {
  React.useEffect(() => {
    publishInstanceResult(id, value);
  });
}

function Instance({ id }: { id: string }) {
  const entry = getInstance(id);
  if (!entry) return null;
  switch (entry.kind) {
    case 'login':
      return <LoginInstance id={id} entry={entry} />;
    case 'geoLogin':
      return <GeoLoginInstance id={id} entry={entry} />;
    case 'logout':
      return <LogoutInstance id={id} entry={entry} />;
    case 'emailLogin':
      return <EmailLoginInstance id={id} entry={entry} />;
    case 'oauthLogin':
      return <OAuthLoginInstance id={id} />;
    case 'accountEffect':
      return <AccountEffectInstance entry={entry} />;
  }
}

type Props = { id: string; entry: InstanceEntry };

function LoginInstance({ id, entry }: Props) {
  const onComplete = useDelegate(entry, 'onComplete');
  const onError = useDelegate(entry, 'onError');
  const value = usePrivyLogin({ onComplete, onError } as Parameters<typeof usePrivyLogin>[0]);
  usePublishResult(id, value);
  return null;
}

function GeoLoginInstance({ id, entry }: Props) {
  const onComplete = useDelegate(entry, 'onComplete');
  const onError = useDelegate(entry, 'onError');
  const value = useGeoLogin({ onComplete, onError } as Parameters<typeof useGeoLogin>[0]);
  usePublishResult(id, value);
  return null;
}

function LogoutInstance({ id, entry }: Props) {
  const onSuccess = useDelegate(entry, 'onSuccess');
  const value = useLogout({ onSuccess } as Parameters<typeof useLogout>[0]);
  usePublishResult(id, value);
  return null;
}

function EmailLoginInstance({ id, entry }: Props) {
  const onComplete = useDelegate(entry, 'onComplete');
  const onError = useDelegate(entry, 'onError');
  const value = useLoginWithEmail({ onComplete, onError } as Parameters<typeof useLoginWithEmail>[0]);
  usePublishResult(id, value);
  return null;
}

/** Also completes a headless OAuth return on mount, so the app registers at most one (`google-oauth.tsx`). */
function OAuthLoginInstance({ id }: { id: string }) {
  const value = useLoginWithOAuth();
  usePublishResult(id, value);
  return null;
}

function AccountEffectInstance({ entry }: { entry: InstanceEntry }) {
  const onConnect = useDelegate(entry, 'onConnect');
  const onDisconnect = useDelegate(entry, 'onDisconnect');
  useAccountEffect({ onConnect, onDisconnect } as Parameters<typeof useAccountEffect>[0]);
  return null;
}

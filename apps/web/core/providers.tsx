'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { Provider as JotaiProvider } from 'jotai';

import { AnalyticsUserIdentifier } from './analytics-user-identifier';
import { BrowserTimezoneReporter } from './debates/browser-timezone';
import { NotificationRegistration } from './notifications/hooks';
import { PrivyAuthTracker } from './privy-auth-tracker';
import { ReactQueryProvider } from './query-client';
import { SentryUserIdentifier } from './sentry-user-identifier';
import { DiffProvider } from './state/diff-store';
import { store } from './state/jotai-store';
import { SyncEngineProvider } from './sync/use-sync-engine';
import { WalletProvider } from './wallet';
import { EmbeddedWalletSync } from './wallet/embedded-wallet-sync';
import { PrivyProvider } from './wallet/privy';

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <PrivyProvider>
      <PrivyAuthTracker />
      <ReactQueryProvider>
        <WalletProvider>
          <EmbeddedWalletSync />
          <AnalyticsUserIdentifier />
          <NotificationRegistration />
          <BrowserTimezoneReporter />
          <SentryUserIdentifier />
          <JotaiProvider store={store}>
            <SyncEngineProvider>
              <DiffProvider>{children}</DiffProvider>
              {process.env.NEXT_PUBLIC_DISABLE_RQ_DEVTOOLS !== '1' && <ReactQueryDevtools initialIsOpen={false} />}
            </SyncEngineProvider>
          </JotaiProvider>
        </WalletProvider>
      </ReactQueryProvider>
    </PrivyProvider>
  );
}

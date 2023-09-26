'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { Services } from './services';
import { ActionsStoreProvider } from './state/actions-store';
import { AragonSDKProvider } from './state/aragon-dao-store';
import { DiffProvider } from './state/diff-store/diff-store';
import { LocalStoreProvider } from './state/local-store';
import { SpaceStoreProvider } from './state/spaces-store';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <Services.Provider>
          <ActionsStoreProvider>
            <SpaceStoreProvider>
              <LocalStoreProvider>
                <StatusBarContextProvider>
                  <DiffProvider>
                    <AragonSDKProvider>{mounted && children}</AragonSDKProvider>
                  </DiffProvider>
                </StatusBarContextProvider>
              </LocalStoreProvider>
            </SpaceStoreProvider>
          </ActionsStoreProvider>
        </Services.Provider>
      </WalletProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

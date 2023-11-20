'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { Services } from './services';
import { ActionsStoreProvider } from './state/actions-store/actions-store-provider';
import { ActiveProposalProvider } from './state/active-proposal-store';
import { DiffProvider } from './state/diff-store';
import { JotaiProvider } from './state/jotai-provider';
import { LocalStoreProvider } from './state/local-store';
import { SpaceStoreProvider } from './state/space-store';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';

const queryClient = new QueryClient();

interface Props {
  onConnectionChange: (type: 'connect' | 'disconnect', address: string) => Promise<void>;
  children: React.ReactNode;
}

export function Providers({ children, onConnectionChange }: Props) {
  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>
        <WalletProvider onConnectionChange={onConnectionChange}>
          <Services.Provider>
            <ActionsStoreProvider>
              <SpaceStoreProvider>
                <LocalStoreProvider>
                  <StatusBarContextProvider>
                    <DiffProvider>
                      <ActiveProposalProvider>{children}</ActiveProposalProvider>
                    </DiffProvider>
                  </StatusBarContextProvider>
                </LocalStoreProvider>
              </SpaceStoreProvider>
            </ActionsStoreProvider>
          </Services.Provider>
        </WalletProvider>
      </JotaiProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

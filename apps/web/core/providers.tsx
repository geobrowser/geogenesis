'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { Services } from './services';
import { ActionsStoreProvider } from './state/actions-store/actions-store-provider';
import { ActiveProposalProvider } from './state/active-proposal-store';
import { DiffProvider } from './state/diff-store';
import { LocalStoreProvider } from './state/local-store';
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
      <WalletProvider onConnectionChange={onConnectionChange}>
        <Services.Provider>
          <ActionsStoreProvider>
            <LocalStoreProvider>
              <StatusBarContextProvider>
                <DiffProvider>
                  <ActiveProposalProvider>{children}</ActiveProposalProvider>
                </DiffProvider>
              </StatusBarContextProvider>
            </LocalStoreProvider>
          </ActionsStoreProvider>
        </Services.Provider>
      </WalletProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

'use client';

import { QueryClient } from '@tanstack/query-core';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { Services } from './services';
import { ActiveProposalProvider } from './state/active-proposal-store';
import { AragonSDKProvider } from './state/aragon-dao-store';
import { DiffProvider } from './state/diff-store';
import { JotaiProvider } from './state/jotai-provider';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';
import { PrivyProvider } from './wallet/privy';

interface Props {
  children: React.ReactNode;
}

const queryClient = new QueryClient();

export function Providers({ children }: Props) {
  return (
    <PrivyProvider>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <JotaiProvider>
            <Services.Provider>
              <StatusBarContextProvider>
                <DiffProvider>
                  <AragonSDKProvider>
                    <ActiveProposalProvider>{children}</ActiveProposalProvider>
                  </AragonSDKProvider>
                </DiffProvider>
              </StatusBarContextProvider>
            </Services.Provider>
          </JotaiProvider>
        </WalletProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </PrivyProvider>
  );
}

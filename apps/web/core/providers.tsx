'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { CookiesProvider } from 'react-cookie';

import * as React from 'react';

import { Services } from './services';
import { ActiveProposalProvider } from './state/active-proposal-store';
import { AragonSDKProvider } from './state/aragon-dao-store';
import { DiffProvider } from './state/diff-store';
import { JotaiProvider } from './state/jotai-provider';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';
import { PrivyProvider } from './wallet/privy';
import { WagmiPrivySyncProvider } from './wallet/wagmi-privy-sync-provider';

interface Props {
  children: React.ReactNode;
}

const queryClient = new QueryClient();

export function Providers({ children }: Props) {
  return (
    <CookiesProvider defaultSetOptions={{ path: '/' }}>
      <PrivyProvider>
        <QueryClientProvider client={queryClient}>
          <WalletProvider>
            <JotaiProvider>
              <Services.Provider>
                <StatusBarContextProvider>
                  <DiffProvider>
                    <AragonSDKProvider>
                      <ActiveProposalProvider>
                        <WagmiPrivySyncProvider />

                        {children}
                      </ActiveProposalProvider>
                    </AragonSDKProvider>
                  </DiffProvider>
                </StatusBarContextProvider>
              </Services.Provider>
            </JotaiProvider>
          </WalletProvider>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </PrivyProvider>
    </CookiesProvider>
  );
}

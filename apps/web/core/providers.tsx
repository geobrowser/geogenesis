'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { ReactQueryProvider } from './query-client';
import { Services } from './services';
import { ActiveProposalProvider } from './state/active-proposal-store';
import { AragonSDKProvider } from './state/aragon-dao-store';
import { DiffProvider } from './state/diff-store';
import { JotaiProvider } from './state/jotai-provider';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <ReactQueryProvider>
      <JotaiProvider>
        <WalletProvider>
          <Services.Provider>
            <StatusBarContextProvider>
              <DiffProvider>
                <AragonSDKProvider>
                  <ActiveProposalProvider>{children}</ActiveProposalProvider>
                </AragonSDKProvider>
              </DiffProvider>
            </StatusBarContextProvider>
          </Services.Provider>
        </WalletProvider>
      </JotaiProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </ReactQueryProvider>
  );
}

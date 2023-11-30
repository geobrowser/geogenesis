'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { ReactQueryProvider } from './query-client';
import { Services } from './services';
import { ActiveProposalProvider } from './state/active-proposal-store';
import { DiffProvider } from './state/diff-store';
import { JotaiProvider } from './state/jotai-provider';
import { StatusBarContextProvider } from './state/status-bar-store';
import { WalletProvider } from './wallet';

interface Props {
  onConnectionChange: (type: 'connect' | 'disconnect', address: string) => Promise<void>;
  children: React.ReactNode;
}

export function Providers({ children, onConnectionChange }: Props) {
  return (
    <ReactQueryProvider>
      <JotaiProvider>
        <WalletProvider onConnectionChange={onConnectionChange}>
          <Services.Provider>
            <StatusBarContextProvider>
              <DiffProvider>
                <ActiveProposalProvider>{children}</ActiveProposalProvider>
              </DiffProvider>
            </StatusBarContextProvider>
          </Services.Provider>
        </WalletProvider>
      </JotaiProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </ReactQueryProvider>
  );
}

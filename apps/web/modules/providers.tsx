import * as React from 'react';

import { ActionsStoreProvider } from './action';
import { Services } from './services';
import { WalletProvider } from './wallet';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Services.Provider>
      <ActionsStoreProvider>
        <WalletProvider>{children}</WalletProvider>
      </ActionsStoreProvider>
    </Services.Provider>
  );
}

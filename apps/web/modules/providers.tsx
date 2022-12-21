import { Theme, ThemeProvider } from '@emotion/react';
import { ActionsStoreProvider } from './action';
import { colors } from './design-system/theme/colors';
import { shadows } from './design-system/theme/shadows';
import { typography } from './design-system/theme/typography';
import { Services } from './services';
import { WalletProvider } from './wallet';

const theme: Theme = {
  colors: colors.light,
  typography: typography.light,
  space: 4,
  radius: 6,
  shadows,
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <Services.Provider>
        <ActionsStoreProvider>
          <WalletProvider>{children}</WalletProvider>
        </ActionsStoreProvider>
      </Services.Provider>
    </ThemeProvider>
  );
}

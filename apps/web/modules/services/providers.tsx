import { Theme, ThemeProvider } from '@emotion/react';
import { colors } from '../design-system/theme/colors';
import { shadows } from '../design-system/theme/shadows';
import { typography } from '../design-system/theme/typography';
import { ServicesProvider } from '../services';
import { WalletProvider } from '../wallet';

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
      <ServicesProvider>
        <WalletProvider>{children}</WalletProvider>
      </ServicesProvider>
    </ThemeProvider>
  );
}

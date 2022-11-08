'use client';

import { colors } from '~/modules/design-system/theme/colors';
import { typography } from '~/modules/design-system/theme/typography';
import { shadows } from '~/modules/design-system/theme/shadows';
import { Theme, ThemeProvider } from '@emotion/react';
// import { WalletProvider } from '~/modules/wallet';
import { ServicesProvider } from '~/modules/services';
import EmotionRootStyleRegistry from './emotion';

const theme: Theme = {
  colors: colors.light,
  typography: typography.light,
  space: 4,
  radius: 6,
  shadows,
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <EmotionRootStyleRegistry>
      <ThemeProvider theme={theme}>
        {/* <WalletProvider> */}
        <ServicesProvider>{children}</ServicesProvider>
        {/* </WalletProvider> */}
      </ThemeProvider>
    </EmotionRootStyleRegistry>
  );
}

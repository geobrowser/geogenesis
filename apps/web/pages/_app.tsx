import { css, Global, Theme, ThemeProvider } from '@emotion/react';
import styled from '@emotion/styled';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import 'modern-normalize';
import { AppProps } from 'next/app';
import Link from 'next/link';
import { Spacer } from '~/modules/design-system/spacer';
import { colors } from '~/modules/design-system/theme/colors';
import { shadows } from '~/modules/design-system/theme/shadows';
import { typography } from '~/modules/design-system/theme/typography';
import { ServicesProvider } from '~/modules/services';
import { WalletProvider } from '~/modules/wallet';
import '../styles/styles.css';

const Body = styled.div(props => ({
  minHeight: '100vh',
  maxWidth: '100vw',
  backgroundColor: `${props.theme.colors.white}`,
  position: 'relative',
  padding: '0 2ch',
}));

const globalStyles = css`
  html {
    scrollbar-gutter: stable;
    overflow: auto;
  }

  body {
    font-family: Calibre, sans-serif;
    text-rendering: 'optimizeLegibility';
    width: 100%;
    height: 100%;
  }
`;

const Layout = styled.main({
  padding: '6ch 0 4ch 0',
  maxWidth: '1060px',
  margin: '0 auto',
});

const theme: Theme = {
  colors: colors.light,
  typography: typography.light,
  space: 4,
  radius: 6,
  shadows,
};

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <WalletProvider>
        <ServicesProvider>
          <Body>
            <Global styles={globalStyles} />
            <Link href="/dev">
              <a>Design system</a>
            </Link>

            <Spacer width={4} />

            <Link href="/spaces">
              <a>Spaces</a>
            </Link>

            <ConnectButton accountStatus="avatar" />

            <Layout>
              <Component {...pageProps} />
            </Layout>
          </Body>
        </ServicesProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}

export default MyApp;

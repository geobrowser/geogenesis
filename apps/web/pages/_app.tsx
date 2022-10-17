import 'modern-normalize';
import '../styles/styles.css';
import { ThemeProvider, css, Global, Theme } from '@emotion/react';
import styled from '@emotion/styled';
import { AppProps } from 'next/app';
import Link from 'next/link';
import { colors } from '~/modules/design-system/theme/colors';
import { typography } from '~/modules/design-system/theme/typography';
import { Spacer } from '~/modules/design-system/spacer';
import { WalletProvider } from '~/modules/wallet';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ServicesProvider } from '~/modules/services';

const Body = styled.div(props => ({
  minHeight: '100vh',
  maxWidth: '100vw',
  overflow: 'hidden',
  backgroundColor: `${props.theme.colors.white}`,
  position: 'relative',
}));

const globalStyles = css`
  html {
    scrollbar-gutter: stable;
    overflow: auto;
  }
  body {
    font-family: Calibre, sans-serif;
    text-rendering: 'optimizeLegibility';
  }
`;

const Layout = styled.main({
  padding: '2ch',
  paddingTop: '6ch',
  margin: '0 auto',
  maxWidth: '1060px',
});

const theme: Theme = {
  colors: colors.light,
  typography: typography.light,
  space: 4,
  radius: 6,
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

            <Link href="/triples">
              <a>Facts database</a>
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

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
import { useIsMounted } from '~/modules/use-is-mounted';
import { TripleStoreProvider } from '~/modules/state/hook';
import { TripleStore } from '~/modules/state/triple-store';
import { Network } from '~/modules/services/network';
import { Log__factory } from '@geogenesis/contracts';
import { AddressLoader } from '~/modules/services/address-loader';
import { StorageClient } from '~/modules/services/storage';

const Body = styled.div(props => ({
  minHeight: '100vh',
  maxWidth: '100vw',
  overflow: 'hidden',
  backgroundColor: `${props.theme.colors.white}`,
}));

const globalStyles = css`
  html {
    scrollbar-gutter: stable;
    overflow: auto;
  }
  body {
    font-family: 'Calibre';
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

const tripleStore = new TripleStore({
  api: new Network(Log__factory, AddressLoader, StorageClient),
  initialtriples: [],
});

function MyApp({ Component, pageProps }: AppProps) {
  // HACK: Doing this to avoid hydration errors with our optimistic UI updates in dev
  const isMounted = useIsMounted();

  return (
    <ThemeProvider theme={theme}>
      <WalletProvider>
        <TripleStoreProvider value={tripleStore}>
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
            {isMounted && (
              <Layout>
                <Component {...pageProps} />
              </Layout>
            )}
          </Body>
        </TripleStoreProvider>
      </WalletProvider>
    </ThemeProvider>
  );
}

export default MyApp;

import { css, Global, Theme, ThemeProvider } from '@emotion/react';
import styled from '@emotion/styled';
import 'modern-normalize';
import { AppProps } from 'next/app';
import { Navbar } from '~/modules/components/navbar';
import { colors } from '~/modules/design-system/theme/colors';
import { shadows } from '~/modules/design-system/theme/shadows';
import { typography } from '~/modules/design-system/theme/typography';
import { ServicesProvider } from '~/modules/services';
import { WalletProvider } from '~/modules/wallet';
import '../styles/styles.css';

const Body = styled.div(props => ({
  minHeight: '100vh',
  maxWidth: '100vw',
  backgroundColor: props.theme.colors.bg,
  position: 'relative',
}));

const globalStyles = css`
  html {
    /* scrollbar-gutter: stable; */
    overflow: auto;
  }

  body {
    font-family: Calibre, sans-serif;
    text-rendering: 'optimizeLegibility';
    background-color: ${colors.light.bg};
    width: 100%;
    height: 100%;
  }
`;

const Layout = styled.main({
  padding: '12ch 2ch 4ch 2ch',
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
            <Navbar />
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

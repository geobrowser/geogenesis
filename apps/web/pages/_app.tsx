import { ThemeProvider, css, Global } from '@emotion/react';
import styled from '@emotion/styled';
import { AppProps } from 'next/app';
import Link from 'next/link';
import { colors } from '~/modules/design-system/theme/colors';
import { typography } from '~/modules/design-system/theme/typography';
import 'modern-normalize';
import '../styles/styles.css';

const Body = styled.div(props => ({
  minHeight: '100vh',
  maxWidth: '100vw',
  overflow: 'hidden',
  backgroundColor: `${props.theme.colors.bg}`,
}));

const globalStyles = css`
  html {
    scrollbar-gutter: stable both-edges;
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

const theme = {
  colors: colors.light,
  typography: typography.light,
};

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider theme={theme}>
      <Body>
        <Global styles={globalStyles} />
        <Link href="/dev">
          <a>Design system</a>
        </Link>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </Body>
    </ThemeProvider>
  );
}

export default MyApp;

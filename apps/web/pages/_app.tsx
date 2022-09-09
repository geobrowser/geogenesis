import styled from '@emotion/styled';
import { AppProps } from 'next/app';
import Link from 'next/link';
import { colors } from '~/modules/design-system/theme/colors';
import 'reset-css';
import '../styles/fonts.css';

const Body = styled.div({
  minHeight: '100vh',
  maxWidth: '100vw',
  overflow: 'hidden',
  backgroundColor: `${colors.bg}`,
  fontFamily: 'Apercu',
});

const Layout = styled.main({
  padding: '2ch',
  paddingTop: '6ch',
  margin: '0 auto',
  maxWidth: '120ch',
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Body>
      <Link href="/dev">
        <a>Design system</a>
      </Link>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </Body>
  );
}

export default MyApp;

import styled from '@emotion/styled';
import { AppProps } from 'next/app';
import Link from 'next/link';
import { colors } from '~/modules/design-system/colors';
import '../reset.css';

const Body = styled.div`
  min-height: 100vh;
  max-width: 100vw;
  overflow: hidden;
  background-color: ${colors.bg};
`;

const Layout = styled.main`
  padding: 2ch;
  padding-top: 6ch;
  margin: 0 auto;
  max-width: 120ch;
`;

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

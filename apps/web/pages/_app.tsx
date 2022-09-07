import styled from '@emotion/styled';
import { AppProps } from 'next/app';
import '../reset.css';

const Layout = styled.div`
  padding: 2ch;
  margin: 0 auto;
  max-width: 70ch;
`;

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}

export default MyApp;

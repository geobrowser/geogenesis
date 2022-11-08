'use client';

import { css, Global } from '@emotion/react';
import styled from '@emotion/styled';
import { Providers } from './providers';
import { Navbar } from '~/modules/components/navbar';
import { colors } from '~/modules/design-system/theme/colors';

import 'modern-normalize';
import '../styles/styles.css';

const Body = styled.div(props => ({
  minHeight: '100vh',
  maxWidth: '100vw',
  backgroundColor: props.theme.colors.bg,
  position: 'relative',
}));

const globalStyles = css`
  html {
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Body>
            <Global styles={globalStyles} />
            <Navbar />
            <Layout>{children}</Layout>
          </Body>
        </Providers>
      </body>
    </html>
  );
}

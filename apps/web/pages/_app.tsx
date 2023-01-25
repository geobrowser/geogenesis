import { css, Global } from '@emotion/react';
import styled from '@emotion/styled';
import { Analytics } from '@vercel/analytics/react';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Action, useActionsStore } from '~/modules/action';
import { FlowBar } from '~/modules/components/flow-bar';
import { Navbar } from '~/modules/components/navbar/navbar';
import { colors } from '~/modules/design-system/theme/colors';
import { Providers } from '~/modules/providers';
import { useEffect, useState } from 'react';
import { Dialog } from '~/modules/search';
import { NavUtils } from '~/modules/utils';
import 'modern-normalize';
import '../styles/styles.css';

const globalStyles = css`
  html {
    overflow-y: overlay;
    overflow-x: hidden;
  }

  body {
    font-family: Calibre, sans-serif;
    text-rendering: 'optimizeLegibility';
    background-color: ${colors.light.bg};
  }
`;

const Layout = styled.main(props => ({
  paddingTop: props.theme.space * 10,
  paddingBottom: props.theme.space * 20,
  maxWidth: 1200,
  margin: '0 auto',

  '@media (max-width: 1200px)': {
    padding: `${props.theme.space * 10}px 2ch 4ch 2ch`,
  },
}));

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  // Toggle the menu when ⌘ + / is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // MacOS
      if (e.key === '/' && e.metaKey) {
        setOpen(open => !open);
      }

      // Windows
      if (e.key === '/' && e.ctrlKey) {
        setOpen(open => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <Providers>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Geo Genesis</title>
        </Head>
        <Global styles={globalStyles} />
        <Navbar onSearchClick={() => setOpen(true)} />
        <Dialog
          open={open}
          onOpenChange={setOpen}
          onDone={result => {
            if (!result?.nameTripleSpace) return;

            router.push(NavUtils.toEntity(result.nameTripleSpace, result.id));
            setOpen(false);
          }}
          spaceId=""
        />
        <Layout>
          <Component {...pageProps} />
          <Analytics />
        </Layout>
        <GlobalFlowBar />
      </Providers>
    </div>
  );
}

const FlowbarContainer = styled.div({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

function GlobalFlowBar() {
  const router = useRouter();
  const { id: spaceId } = router.query as { id: string | undefined };
  const { actions, publish, clear } = useActionsStore(spaceId);

  return (
    <FlowbarContainer>
      <FlowBar actions={Action.unpublishedChanges(actions)} onClear={clear} onPublish={publish} spaceId={spaceId} />
    </FlowbarContainer>
  );
}

export default MyApp;

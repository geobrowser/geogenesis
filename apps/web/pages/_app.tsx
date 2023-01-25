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
import { useState } from 'react';
import { Dialog } from '~/modules/search';
import { NavUtils } from '~/modules/utils';
import { useKeyboardShortcuts } from '~/modules/hooks/use-keyboard-shortcuts';
import { useEditable } from '~/modules/stores/use-editable';

import 'modern-normalize';
import '../styles/styles.css';
import { useAccessControl } from '~/modules/auth/use-access-control';

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

const Relative = styled.div({
  position: 'relative',
});

function Root(props: AppProps) {
  return (
    <Relative>
      <Providers>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Geo Genesis</title>
        </Head>
        <Global styles={globalStyles} />
        <App {...props} />
      </Providers>
    </Relative>
  );
}

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { id: spaceId } = router.query as { id: string | undefined };
  const { setEditable, editable } = useEditable();
  const { isEditor, isAdmin, isEditorController } = useAccessControl(spaceId);
  const [open, setOpen] = useState(false);

  useKeyboardShortcuts(
    [
      // Toggle the menu when ⌘ + / is pressed
      {
        key: '/',
        callback: () => setOpen(open => !open),
      },
      // Toggle edit mode when ⌘ + e is pressed
      {
        key: 'e',
        callback: () => {
          if (isEditor || isAdmin || isEditorController) setEditable(!editable);
        },
      },
    ],
    [editable, open, isEditor]
  );

  return (
    <>
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
      <GlobalFlowBar spaceId={spaceId ?? ''} />
    </>
  );
}

const FlowbarContainer = styled.div({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

function GlobalFlowBar({ spaceId }: { spaceId: string }) {
  const { actions, publish, clear } = useActionsStore(spaceId);

  return (
    <FlowbarContainer>
      <FlowBar actions={Action.unpublishedChanges(actions)} onClear={clear} onPublish={publish} spaceId={spaceId} />
    </FlowbarContainer>
  );
}

export default Root;

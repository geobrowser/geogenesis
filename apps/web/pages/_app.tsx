import * as React from 'react';
import { useState } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Analytics } from '@vercel/analytics/react';
import { configureObservablePersistence } from '@legendapp/state/persist';
import { ObservablePersistLocalStorage } from '@legendapp/state/persist-plugins/local-storage';

import { Navbar } from '~/modules/components/navbar/navbar';
import { Providers } from '~/modules/providers';
import { Dialog } from '~/modules/search';
import { Main } from '~/modules/components/main';
import { NavUtils } from '~/modules/utils';
import { useKeyboardShortcuts } from '~/modules/hooks/use-keyboard-shortcuts';
import { useEditable } from '~/modules/stores/use-editable';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { ClientOnly } from '~/modules/components/client-only';
import { FlowBar } from '~/modules/components/flow-bar';
import { Review } from '~/modules/components/review';

import '../styles/styles.css';
import '../styles/fonts.css';

// Enable localStorage persistence
configureObservablePersistence({
  persistLocal: ObservablePersistLocalStorage,
});

function Root(props: AppProps) {
  return (
    <div className="relative">
      <Providers>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Geo Genesis</title>
        </Head>
        <App {...props} />
      </Providers>
    </div>
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
      <Main>
        <Component {...pageProps} />
        <Analytics />
      </Main>
      <ClientOnly>
        <FlowBar />
        <Review />
      </ClientOnly>
    </>
  );
}

export default Root;

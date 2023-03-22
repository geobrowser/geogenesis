import { Analytics } from '@vercel/analytics/react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { Action, useActionsStore } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { FlowBar } from '~/modules/components/flow-bar';
import { Navbar } from '~/modules/components/navbar/navbar';
import { useKeyboardShortcuts } from '~/modules/hooks/use-keyboard-shortcuts';
import { OnboardingDialog } from '~/modules/onboarding/dialog';
import { Providers } from '~/modules/providers';
import { Dialog } from '~/modules/search';
import { useEditable } from '~/modules/stores/use-editable';
import { NavUtils } from '~/modules/utils';

import 'react-medium-image-zoom/dist/styles.css';
import '../styles/fonts.css';
import '../styles/styles.css';
import '../styles/tiptap.css';

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
      <OnboardingDialog />
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
      <main className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch]">
        <Component {...pageProps} />
        <Analytics />
      </main>
      <GlobalFlowBar spaceId={spaceId ?? ''} />
    </>
  );
}

function GlobalFlowBar({ spaceId }: { spaceId: string }) {
  const { actions, publish, clear } = useActionsStore(spaceId);

  return (
    <div className="relative flex flex-col items-center">
      <FlowBar actions={Action.unpublishedChanges(actions)} onClear={clear} onPublish={publish} spaceId={spaceId} />
    </div>
  );
}

export default Root;

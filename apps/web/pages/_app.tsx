import * as React from 'react';
import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Analytics } from '@vercel/analytics/react';
import type { AppProps } from 'next/app';

import { useAccessControl } from '~/modules/auth/use-access-control';
import { Navbar } from '~/modules/components/navbar/navbar';
import { useKeyboardShortcuts } from '~/modules/hooks/use-keyboard-shortcuts';
import { OnboardingDialog } from '~/modules/onboarding/dialog';
import { Providers } from '~/modules/providers';
import { Dialog } from '~/modules/search';
import { Main } from '~/modules/components/main';
import { useEditable } from '~/modules/stores/use-editable';
import { NavUtils } from '~/modules/utils';
import { ClientOnly } from '~/modules/components/client-only';
import { FlowBar } from '~/modules/components/flow-bar';
import { Review } from '~/modules/components/review';
import { Persistence } from '~/modules/persistence';
import { useReview } from '~/modules/review';

import 'react-medium-image-zoom/dist/styles.css';
import '../styles/fonts.css';
import '../styles/styles.css';
import '../styles/tiptap.css';
import { Toast } from '~/modules/hooks/use-toast';

function Root(props: AppProps) {
  return (
    <div className="relative">
      <Providers>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
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
  const { isReviewOpen, setIsReviewOpen } = useReview();

  // Ideally memoization happens in the useKeyboardShortcuts hook
  const memoizedShortcuts = React.useMemo(
    () => [
      // Toggle the menu when ⌘ + / is pressed
      {
        key: '/',
        callback: () => setOpen(open => !open),
      },
      {
        key: '.',
        callback: () => setIsReviewOpen(!isReviewOpen),
      },
      // Toggle edit mode when ⌘ + e is pressed
      {
        key: 'e',
        callback: () => {
          if (isEditor || isAdmin || isEditorController) setEditable(!editable);
        },
      },
    ],
    [editable, isEditor, isAdmin, isEditorController, setOpen, setEditable, setIsReviewOpen, isReviewOpen]
  );

  useKeyboardShortcuts(memoizedShortcuts);

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
      />
      <Main>
        <Component {...pageProps} />
      </Main>
      {/* Client-side rendered due to `window.localStorage` usage */}
      <ClientOnly>
        <Toast />
        <FlowBar />
        <Review />
        <Persistence />
      </ClientOnly>
      <Analytics />
    </>
  );
}

export default Root;

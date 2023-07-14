'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { ClientOnly } from '~/modules/components/client-only';
import { Compare } from '~/modules/components/compare';
import { FlowBar } from '~/modules/components/flow-bar';
import { Main } from '~/modules/components/main';
import { Navbar } from '~/modules/components/navbar/navbar';
import { Review } from '~/modules/components/review';
import { useDiff } from '~/modules/diff';
import { useKeyboardShortcuts } from '~/modules/hooks/use-keyboard-shortcuts';
import { Toast } from '~/modules/hooks/use-toast';
import { OnboardingDialog } from '~/modules/onboarding/dialog';
import { Persistence } from '~/modules/persistence';
import { Dialog } from '~/modules/search';
import { useEditable } from '~/modules/stores/use-editable';
import { NavUtils } from '~/modules/utils';

export function App({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const x = useParams();
  console.log('params', x);
  // const { id: spaceId } = router.query as { id: string | undefined };
  const { setEditable, editable } = useEditable();
  const { isEditor, isAdmin, isEditorController } = useAccessControl();
  const [open, setOpen] = React.useState(false);
  const { isReviewOpen, setIsReviewOpen } = useDiff();

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
      <Main>{children}</Main>
      {/* Client-side rendered due to `window.localStorage` usage */}
      <ClientOnly>
        <Toast />
        <FlowBar />
        <Review />
        <Compare />
        <Persistence />
      </ClientOnly>
      {/* <Analytics /> */}
    </>
  );
}

'use client';

import { Analytics } from '@vercel/analytics/react';

import * as React from 'react';

import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { Toast } from '~/core/hooks/use-toast';
import { useDiff } from '~/core/state/diff-store';
import { Persistence } from '~/core/state/persistence';

import { ClientOnly } from '~/design-system/client-only';

import { Compare } from '~/partials/history/compare';
import { Main } from '~/partials/main';
import { Navbar } from '~/partials/navbar/navbar';
import { CreateProfileDialog } from '~/partials/onboarding/create-profile-dialog';
import { OnboardingDialog } from '~/partials/onboarding/dialog';
import { FlowBar } from '~/partials/review/flow-bar';
import { Review } from '~/partials/review/review';
import { Dialog } from '~/partials/search';

export function App({ children }: { children: React.ReactNode }) {
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
    ],
    [setOpen, setIsReviewOpen, isReviewOpen]
  );

  useKeyboardShortcuts(memoizedShortcuts);

  return (
    <>
      <Navbar onSearchClick={() => setOpen(true)} />

      <CreateProfileDialog />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        onDone={result => {
          setOpen(false);
        }}
      />
      <Main>{children}</Main>
      {/* Client-side rendered due to `window.localStorage` usage */}
      <ClientOnly>
        <OnboardingDialog />
        <Toast />
        <FlowBar />
        <Review />
        <Compare />
        {/* @TODO remove */}
        <Persistence />
      </ClientOnly>
      <Analytics />
    </>
  );
}

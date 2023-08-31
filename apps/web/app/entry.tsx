'use client';

import { Analytics } from '@vercel/analytics/react';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { Toast } from '~/core/hooks/use-toast';
import { useDiff } from '~/core/state/diff-store/diff-store';
import { Persistence } from '~/core/state/persistence';
import { NavUtils } from '~/core/utils/utils';

import { ClientOnly } from '~/design-system/client-only';

import { Compare } from '~/partials/history/compare';
import { Main } from '~/partials/main';
import { Navbar } from '~/partials/navbar/navbar';
import { OnboardingDialog } from '~/partials/onboarding/dialog';
import { FlowBar, Review } from '~/partials/review';
import { Dialog } from '~/partials/search';

export function App({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
      <Analytics />
    </>
  );
}

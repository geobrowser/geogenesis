'use client';

import { Analytics } from '@vercel/analytics/react';

import * as React from 'react';

import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { Toast } from '~/core/hooks/use-toast';
import { useDiff } from '~/core/state/diff-store';
import { Persistence } from '~/core/state/persistence';

import { ClientOnly } from '~/design-system/client-only';

import { Main } from '~/partials/main';
import { Navbar } from '~/partials/navbar/navbar';
import { OnboardingDialog } from '~/partials/onboarding/dialog';
import { FlowBar } from '~/partials/review/flow-bar';
import { ReviewChanges } from '~/partials/review/review-changes';
import { SearchDialog } from '~/partials/search';

export function App({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  const { isReviewOpen, setIsReviewOpen } = useDiff();

  const memoizedShortcuts = React.useMemo(
    () => [
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
      <SearchDialog open={open} onDone={() => setOpen(false)} />
      <Main>{children}</Main>
      {/* Client-side rendered due to `window.localStorage` usage */}
      <ClientOnly>
        <OnboardingDialog />
        <Toast />
        <FlowBar />
        <ReviewChanges />
        {/* @TODO remove */}
        <Persistence />
      </ClientOnly>
      {process.env.NODE_ENV === 'production' && <Analytics />}
    </>
  );
}

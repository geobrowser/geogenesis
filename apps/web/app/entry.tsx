'use client';

import { Analytics } from '@vercel/analytics/react';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { Toast } from '~/core/hooks/use-toast';
import { useDiff } from '~/core/state/diff-store';
import { Persistence } from '~/core/state/persistence';

import { ClientOnly } from '~/design-system/client-only';

import { GovernanceReopenEditLoadingBar } from '~/partials/governance/governance-reopen-edit-loading-bar';
import { Main } from '~/partials/main';
import { Navbar } from '~/partials/navbar/navbar';
import { FlowBar } from '~/partials/review/flow-bar';
import { SearchDialog } from '~/partials/search';

const OnboardingDialog = dynamic(
  () => import('~/partials/onboarding/dialog').then(m => ({ default: m.OnboardingDialog })),
  { ssr: false }
);

const ReviewChanges = dynamic(
  () => import('~/partials/review/review-changes').then(m => ({ default: m.ReviewChanges })),
  { ssr: false }
);

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
        <GovernanceReopenEditLoadingBar />
        <FlowBar />
        <ReviewChanges />
        <Persistence />
      </ClientOnly>
      {process.env.NODE_ENV === 'production' && <Analytics />}
    </>
  );
}

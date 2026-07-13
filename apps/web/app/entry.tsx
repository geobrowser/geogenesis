'use client';

import { Analytics } from '@vercel/analytics/react';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import dynamic from 'next/dynamic';

import { DebateCoordinator } from '~/core/debates/debate-coordinator';
import { useGeoLogoutCleanup } from '~/core/hooks/use-geo-logout';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { Toast } from '~/core/hooks/use-toast';
import { browseSidebarOpenAtom } from '~/core/state/browse-sidebar-state';
import { useDiff } from '~/core/state/diff-store';
import { Persistence } from '~/core/state/persistence';

import { ClientOnly } from '~/design-system/client-only';

import { BrowseSidebar } from '~/partials/browse-sidebar/browse-sidebar';
import { CreateSpaceDialog } from '~/partials/create-space/create-space-dialog';
import { EntitySidePanel } from '~/partials/entity-page/entity-side-panel';
import { FeatureFlagsDialog } from '~/partials/feature-flags/feature-flags-dialog';
import { GovernanceReopenEditLoadingBar } from '~/partials/governance/governance-reopen-edit-loading-bar';
import { Main } from '~/partials/main';
import { Navbar } from '~/partials/navbar/navbar';
import { FlowBar } from '~/partials/review/flow-bar';
import { StatusBar } from '~/partials/review/status-bar';
import { SearchDialog } from '~/partials/search';

import { PageViewTracker } from '~/app/page-view-tracker';
import { rankingFullscreenActiveAtom } from '~/atoms';

const OnboardingDialog = dynamic(
  () => import('~/partials/onboarding/dialog').then(m => ({ default: m.OnboardingDialog })),
  { ssr: false }
);

const PendingPersonalSpaceRunner = dynamic(
  () =>
    import('~/partials/onboarding/pending-personal-space-runner').then(m => ({
      default: m.PendingPersonalSpaceRunner,
    })),
  { ssr: false }
);

const SignInPrompt = dynamic(
  () => import('~/partials/sign-in-prompt/sign-in-prompt').then(m => ({ default: m.SignInPrompt })),
  { ssr: false }
);

const PostAuthRedirect = dynamic(
  () => import('~/partials/post-auth-redirect').then(m => ({ default: m.PostAuthRedirect })),
  { ssr: false }
);

const ReviewChanges = dynamic(
  () => import('~/partials/review/review-changes').then(m => ({ default: m.ReviewChanges })),
  { ssr: false }
);

const ChatWidget = dynamic(() => import('~/partials/chat/chat-widget').then(m => ({ default: m.ChatWidget })), {
  ssr: false,
});

export function App({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const sidebarOpen = useAtomValue(browseSidebarOpenAtom);
  const rankingFullscreenActive = useAtomValue(rankingFullscreenActiveAtom);

  const { isReviewOpen, setIsReviewOpen } = useDiff();

  // Owns the on-logout cleanup for the whole app (see useGeoLogoutCleanup).
  useGeoLogoutCleanup();

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
    <div className="flex min-h-[100dvh] items-stretch">
      <React.Suspense fallback={null}>
        <PageViewTracker />
      </React.Suspense>
      <div className="sm:hidden">{!rankingFullscreenActive && <BrowseSidebar />}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onSearchClick={() => setOpen(true)} hideLogo={sidebarOpen && !rankingFullscreenActive} />
        <SearchDialog open={open} onDone={() => setOpen(false)} />
        <div className="min-w-0 flex-1 xl:px-[2ch]">
          <Main>{children}</Main>
        </div>
      </div>
      <EntitySidePanel />
      {/* Client-side rendered due to `window.localStorage` usage */}
      <ClientOnly>
        <OnboardingDialog />
        <PendingPersonalSpaceRunner />
        <CreateSpaceDialog />
        <SignInPrompt />
        <PostAuthRedirect />
        <Toast />
        <GovernanceReopenEditLoadingBar />
        <FlowBar />
        <StatusBar />
        <ReviewChanges />
        <ChatWidget />
        <FeatureFlagsDialog />
        <DebateCoordinator />
        <Persistence />
      </ClientOnly>
      {process.env.NODE_ENV === 'production' && <Analytics />}
    </div>
  );
}

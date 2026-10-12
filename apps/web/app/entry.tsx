'use client';

import { Analytics } from '@vercel/analytics/react';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import dynamic from 'next/dynamic';

import { DebateCoordinator } from '~/core/debates/debate-coordinator';
import { DebateMediaSessionProvider } from '~/core/debates/media-session';
import { PlaybackDiagnostics } from '~/core/debates/playback-diagnostics';
import { DebateRecordingUploadCoordinator } from '~/core/debates/recording-upload-coordinator';
import { useGeoLogoutCleanup } from '~/core/hooks/use-geo-logout';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { Toast } from '~/core/hooks/use-toast';
import { browseSidebarOpenAtom } from '~/core/state/browse-sidebar-state';
import { useDiff } from '~/core/state/diff-store';
import { Persistence } from '~/core/state/persistence';

import { ClientOnly } from '~/design-system/client-only';
import { SlideUpBodyState } from '~/design-system/slide-up-body-state';

import { BrowseSidebar } from '~/partials/browse-sidebar/browse-sidebar';
import { MobileBrowseDrawer } from '~/partials/browse-sidebar/mobile-browse-drawer';
import { EntityStickyHeaderHost } from '~/partials/entity-page/entity-sticky-header-host';
import { PersonalProfileCreatePostSidePanelSync } from '~/partials/entity-page/personal-profile-create-post-side-panel-sync';
import { GovernanceReopenEditLoadingBar } from '~/partials/governance/governance-reopen-edit-loading-bar';
import { Main } from '~/partials/main';
import { Navbar } from '~/partials/navbar/navbar';
import { PendingActionsRunner } from '~/partials/pending-actions-runner';
import { LocalVotesSaver } from '~/partials/save-votes/local-votes-saver';

import { PageViewTracker } from '~/app/page-view-tracker';
import { rankingFullscreenActiveAtom, rankingFullscreenFocusTargetAtom } from '~/atoms';

// Opened on demand, so none of these is needed to paint or hydrate a page. Each renders nothing
// until something opens it, which is also what the server rendered, so there is nothing to mismatch.
const CreateSpaceDialog = dynamic(
  () => import('~/partials/create-space/create-space-dialog').then(m => ({ default: m.CreateSpaceDialog })),
  { ssr: false }
);
const EntitySidePanel = dynamic(
  () => import('~/partials/entity-page/entity-side-panel').then(m => ({ default: m.EntitySidePanel })),
  { ssr: false }
);
const EntityCommentsPanelHost = dynamic(
  () => import('~/partials/comments/entity-comments-panel-host').then(m => ({ default: m.EntityCommentsPanelHost })),
  { ssr: false }
);
const FeatureFlagsDialog = dynamic(
  () => import('~/partials/feature-flags/feature-flags-dialog').then(m => ({ default: m.FeatureFlagsDialog })),
  { ssr: false }
);
const FlowBar = dynamic(() => import('~/partials/review/flow-bar').then(m => ({ default: m.FlowBar })), { ssr: false });
const StatusBar = dynamic(() => import('~/partials/review/status-bar').then(m => ({ default: m.StatusBar })), {
  ssr: false,
});
const SaveVotesSheet = dynamic(
  () => import('~/partials/save-votes/save-votes-sheet').then(m => ({ default: m.SaveVotesSheet })),
  { ssr: false }
);
const SearchDialog = dynamic(() => import('~/partials/search').then(m => ({ default: m.SearchDialog })), {
  ssr: false,
});

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

const PendingCreatedSpaceRunner = dynamic(
  () =>
    import('~/partials/create-space/pending-created-space-runner').then(m => ({
      default: m.PendingCreatedSpaceRunner,
    })),
  { ssr: false }
);

const PendingCreatedSpaceStatus = dynamic(
  () =>
    import('~/partials/create-space/pending-created-space-status').then(m => ({
      default: m.PendingCreatedSpaceStatus,
    })),
  { ssr: false }
);

const PostAuthRedirect = dynamic(
  () => import('~/partials/post-auth-redirect').then(m => ({ default: m.PostAuthRedirect })),
  { ssr: false }
);

const DeepLinkHandler = dynamic(
  () => import('~/partials/deep-links/deep-link-handler').then(m => ({ default: m.DeepLinkHandler })),
  { ssr: false }
);

const ReviewChanges = dynamic(
  () => import('~/partials/review/review-changes').then(m => ({ default: m.ReviewChanges })),
  { ssr: false }
);

const ChatWidget = dynamic(() => import('~/partials/chat/chat-widget').then(m => ({ default: m.ChatWidget })), {
  ssr: false,
});

const DebatesHubPanel = dynamic(
  () => import('~/core/debates/matchmaking/debates-hub-panel').then(m => ({ default: m.DebatesHubPanel })),
  { ssr: false }
);

export function App({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [mobileBrowseOpen, setMobileBrowseOpen] = React.useState(false);
  const mobileBrowseButtonRef = React.useRef<HTMLButtonElement>(null);
  const navbarRef = React.useRef<HTMLElement>(null);
  const sidebarOpen = useAtomValue(browseSidebarOpenAtom);
  const fullscreenActive = useAtomValue(rankingFullscreenActiveAtom);
  const rankingFullscreenFocusTarget = useAtomValue(rankingFullscreenFocusTargetAtom);

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

  React.useEffect(() => {
    if (fullscreenActive) setMobileBrowseOpen(false);
  }, [fullscreenActive]);

  return (
    <DebateMediaSessionProvider>
      <div className="flex min-h-[100dvh] items-stretch">
        <React.Suspense fallback={null}>
          <PageViewTracker />
        </React.Suspense>
        <div className="mobile:hidden">{!fullscreenActive && <BrowseSidebar />}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar
            browseOpen={mobileBrowseOpen && !fullscreenActive}
            browseButtonRef={mobileBrowseButtonRef}
            navbarRef={navbarRef}
            onBrowseClick={() => setMobileBrowseOpen(true)}
            onSearchClick={() => setOpen(true)}
            hideLogo={sidebarOpen && !fullscreenActive}
            showBrowseButton={!fullscreenActive}
          />
          <MobileBrowseDrawer
            open={mobileBrowseOpen && !fullscreenActive}
            fallbackFocusRef={navbarRef}
            fullscreenFocusTarget={rankingFullscreenFocusTarget}
            onOpenChange={setMobileBrowseOpen}
            triggerRef={mobileBrowseButtonRef}
          />
          <SearchDialog open={open} onDone={() => setOpen(false)} />
          {/* Directly under the navbar and above the page: a zero-height dock the entity route
              portals its sticky header into. See `EntityStickyHeaderHost`. The collapsed sidebar
              leaves a vertical rail across this column with nothing holding the space — the same
              condition that draws it below. */}
          <EntityStickyHeaderHost railInset={!sidebarOpen && !fullscreenActive} />
          <div className="min-w-0 flex-1 2xl:px-[2ch]">
            <Main>{children}</Main>
          </div>
        </div>
        <SlideUpBodyState />
        <EntitySidePanel />
        <PlaybackDiagnostics />
        <EntityCommentsPanelHost />
        {/* Client-side rendered due to `window.localStorage` usage */}
        <ClientOnly>
          <OnboardingDialog />
          <PendingPersonalSpaceRunner />
          <PendingActionsRunner />
          <LocalVotesSaver />
          {/* Suspense: onboarding preparation reads `useSearchParams`. */}
          <React.Suspense fallback={null}>
            <SaveVotesSheet />
          </React.Suspense>
          <CreateSpaceDialog />
          <PendingCreatedSpaceRunner />
          <PendingCreatedSpaceStatus />
          <PostAuthRedirect />
          <React.Suspense fallback={null}>
            <DeepLinkHandler />
          </React.Suspense>
          <Toast />
          <GovernanceReopenEditLoadingBar />
          <FlowBar />
          <StatusBar />
          <ReviewChanges />
          <ChatWidget />
          <FeatureFlagsDialog />
          <DebateCoordinator />
          {/* Suspense: the panel reads `useSearchParams` to tell a debates deep link apart from
              an ordinary navigation. */}
          <React.Suspense fallback={null}>
            <DebatesHubPanel />
          </React.Suspense>
          <DebateRecordingUploadCoordinator />
          <Persistence />
        </ClientOnly>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </div>
      <React.Suspense fallback={null}>
        <PersonalProfileCreatePostSidePanelSync />
      </React.Suspense>
    </DebateMediaSessionProvider>
  );
}

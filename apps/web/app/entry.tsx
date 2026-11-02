'use client';

import { Analytics } from '@vercel/analytics/react';

import * as React from 'react';

import { useAtomValue } from 'jotai';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';

import { DebateCoordinator } from '~/core/debates/debate-coordinator';
import { LastPageOutsideDebatesTracker } from '~/core/debates/lobbies/lobby-exit';
import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { DebateMediaSessionProvider } from '~/core/debates/media-session';
import { PlaybackDiagnostics } from '~/core/debates/playback-diagnostics';
import { DebateRecordingUploadCoordinator } from '~/core/debates/recording-upload-coordinator';
import { requestsAnyModal } from '~/core/deep-links/modal-deep-link';
import { noteEmailArrival } from '~/core/deep-links/ref-email';
import { useEntityCommentsPanel } from '~/core/hooks/use-entity-comments-panel';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useGeoLogoutCleanup } from '~/core/hooks/use-geo-logout';
import { useKeyboardShortcuts } from '~/core/hooks/use-keyboard-shortcuts';
import { useOnboarding } from '~/core/hooks/use-onboarding';
import { useSticky } from '~/core/hooks/use-sticky';
import { Toast } from '~/core/hooks/use-toast';
import { browseSidebarShownAtom } from '~/core/state/browse-sidebar-state';
import { useDiff } from '~/core/state/diff-store';
import { useEditable } from '~/core/state/editable-store';
import { useLocalVotes } from '~/core/state/local-votes';
import { pendingCreatedSpaceAtom } from '~/core/state/pending-created-space';
import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { Persistence } from '~/core/state/persistence';
import { useSaveVotesPrompt } from '~/core/state/save-votes-prompt';
import { useStatusBar } from '~/core/state/status-bar-store';
import { usePrivy } from '~/core/wallet/auth-hooks';

import { ClientOnly } from '~/design-system/client-only';
import { SlideUpBodyState } from '~/design-system/slide-up-body-state';

import { BrowseSidebar } from '~/partials/browse-sidebar/browse-sidebar';
import { MobileBrowseDrawer } from '~/partials/browse-sidebar/mobile-browse-drawer';
import { ChatLauncher } from '~/partials/chat/chat-launcher';
import { createSpaceDialogOpenAtom } from '~/partials/create-space/create-space-state';
import { EntityStickyHeaderHost } from '~/partials/entity-page/entity-sticky-header-host';
import { PersonalProfileCreatePostSidePanelSync } from '~/partials/entity-page/personal-profile-create-post-side-panel-sync';
import { GovernanceReopenEditLoadingBar } from '~/partials/governance/governance-reopen-edit-loading-bar';
import { Main } from '~/partials/main';
import { Navbar } from '~/partials/navbar/navbar';
import { stepAtom as onboardingStepAtom } from '~/partials/onboarding/onboarding-atoms';
import { shouldOpenOnboardingDialog } from '~/partials/onboarding/onboarding-dialog-visibility';
import { PendingActionsRunner } from '~/partials/pending-actions-runner';
import { LocalVotesSaver } from '~/partials/save-votes/local-votes-saver';

import { PageViewTracker } from '~/app/page-view-tracker';
import {
  entitySidePanelWantsEditAtom,
  exploreDebateClaimsPanelAtom,
  rankingFullscreenActiveAtom,
  rankingFullscreenFocusTargetAtom,
} from '~/atoms';
import { feedTopicsAtom } from '~/atoms/onboarding-feed-topics';
import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

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
const ExploreDebateClaimsPanelHost = dynamic(
  () =>
    import('~/partials/explore/explore-debate-claims-panel-host').then(m => ({
      default: m.ExploreDebateClaimsPanelHost,
    })),
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

const PendingTopicFollowsRunner = dynamic(
  () =>
    import('~/partials/onboarding/pending-topic-follows-runner').then(m => ({
      default: m.PendingTopicFollowsRunner,
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

const DebatesHubPanel = dynamic(
  () => import('~/core/debates/matchmaking/debates-hub-panel').then(m => ({ default: m.DebatesHubPanel })),
  { ssr: false }
);

// Each lazy piece below mounts only once what it serves exists, and stays mounted afterwards so its
// state and exit animations survive. Mounting is what fetches the chunk, so before this every page
// paid for all of them straight after hydration.

function CreateSpaceDialogGate() {
  const open = useAtomValue(createSpaceDialogOpenAtom);
  return useSticky(open) ? <CreateSpaceDialog /> : null;
}

function EntitySidePanelGate() {
  const { sidePanelTarget } = useEntitySidePanel();
  return useSticky(sidePanelTarget !== null) ? <EntitySidePanel /> : null;
}

function EntityCommentsPanelGate() {
  const { commentsTarget } = useEntityCommentsPanel();
  return useSticky(commentsTarget !== null) ? <EntityCommentsPanelHost /> : null;
}

function ExploreDebateClaimsPanelGate() {
  const target = useAtomValue(exploreDebateClaimsPanelAtom);
  return useSticky(target !== null) ? <ExploreDebateClaimsPanelHost /> : null;
}

// Opens from /feature-flags or Cmd/Ctrl+Shift+F. The listener lives in the dialog once it is loaded;
// until then this one catches the first press and hands the dialog an open state to start from.
function FeatureFlagsGate() {
  const pathname = usePathname();
  const [pressed, setPressed] = React.useState(false);
  const mounted = useSticky(pathname === '/feature-flags' || pressed);

  React.useEffect(() => {
    if (mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      setPressed(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mounted]);

  return mounted ? <FeatureFlagsDialog defaultShortcutOpen={pressed} /> : null;
}

function FlowBarGate() {
  const { editable } = useEditable();
  const sidePanelWantsEdit = useAtomValue(entitySidePanelWantsEditAtom);
  return useSticky(editable || sidePanelWantsEdit) ? <FlowBar /> : null;
}

function StatusBarGate() {
  const {
    state: { reviewState },
  } = useStatusBar();
  return useSticky(reviewState !== 'idle' && reviewState !== 'reviewing') ? <StatusBar /> : null;
}

function ReviewChangesGate() {
  const { isReviewOpen } = useDiff();
  const {
    state: { reviewState },
  } = useStatusBar();
  return useSticky(isReviewOpen || reviewState !== 'idle') ? <ReviewChanges /> : null;
}

// Also shows itself to a signed-out visitor who already has local votes (the return-visit prompt).
function SaveVotesGate() {
  // The sheet mounts only once there is something to ask, often pages after the landing, so whether
  // the visit came from one of our emails is noted here, on arrival (GEO-3374).
  React.useEffect(() => noteEmailArrival(), []);
  const prompt = useSaveVotesPrompt();
  const { votes } = useLocalVotes();
  const { ready, authenticated } = usePrivy();
  return useSticky(prompt !== null || (ready && votes.length > 0 && !authenticated)) ? <SaveVotesSheet /> : null;
}

function OnboardingGate() {
  const { isOnboardingVisible } = useOnboarding();
  const step = useAtomValue(onboardingStepAtom);
  return useSticky(shouldOpenOnboardingDialog(isOnboardingVisible, step)) ? <OnboardingDialog /> : null;
}

function PendingPersonalSpaceGate() {
  const pending = useAtomValue(pendingPersonalSpaceAtom);
  return useSticky(pending !== null) ? <PendingPersonalSpaceRunner /> : null;
}

function PendingTopicFollowsGate() {
  const held = useAtomValue(feedTopicsAtom);
  return useSticky((held?.topics?.length ?? 0) > 0) ? <PendingTopicFollowsRunner /> : null;
}

function PendingCreatedSpaceGate() {
  const pending = useAtomValue(pendingCreatedSpaceAtom);
  const mounted = useSticky(pending !== null);
  return mounted ? (
    <>
      <PendingCreatedSpaceRunner />
      <PendingCreatedSpaceStatus />
    </>
  ) : null;
}

function PostAuthRedirectGate() {
  const redirect = useAtomValue(postOnboardingRedirectAtom);
  return useSticky(redirect !== null) ? <PostAuthRedirect /> : null;
}

// Every deep link is a `?modal=` URL.
function DeepLinkGate() {
  const searchParams = useSearchParams();
  return useSticky(requestsAnyModal(searchParams)) ? <DeepLinkHandler /> : null;
}

function DebatesHubGate() {
  const { isOpen } = useDebatesHub();
  return useSticky(isOpen) ? <DebatesHubPanel /> : null;
}

export function App({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [mobileBrowseOpen, setMobileBrowseOpen] = React.useState(false);
  const mobileBrowseButtonRef = React.useRef<HTMLButtonElement>(null);
  const navbarRef = React.useRef<HTMLElement>(null);
  const sidebarOpen = useAtomValue(browseSidebarShownAtom);
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
      {/* Keep mobile content bleed inside the viewport. `clip` preserves document scrolling
          and sticky positioning while nested carousels and tables retain their own scrollers. */}
      <div className="flex min-h-[100dvh] items-stretch md:overflow-x-clip">
        <React.Suspense fallback={null}>
          <PageViewTracker />
          <LastPageOutsideDebatesTracker />
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
          {open && <SearchDialog open onDone={() => setOpen(false)} />}
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
        <EntitySidePanelGate />
        <PlaybackDiagnostics />
        <EntityCommentsPanelGate />
        <ExploreDebateClaimsPanelGate />
        {/* Client-side rendered due to `window.localStorage` usage */}
        <ClientOnly>
          {/* Suspense: onboarding preparation reads `useSearchParams`. */}
          <React.Suspense fallback={null}>
            <OnboardingGate />
            <SaveVotesGate />
          </React.Suspense>
          <PendingPersonalSpaceGate />
          <PendingTopicFollowsGate />
          <PendingActionsRunner />
          <LocalVotesSaver />
          <CreateSpaceDialogGate />
          <PendingCreatedSpaceGate />
          <PostAuthRedirectGate />
          <React.Suspense fallback={null}>
            <DeepLinkGate />
          </React.Suspense>
          <Toast />
          <GovernanceReopenEditLoadingBar />
          <FlowBarGate />
          <StatusBarGate />
          <ReviewChangesGate />
          <ChatLauncher />
          <FeatureFlagsGate />
          <DebateCoordinator />
          {/* Suspense: the panel reads `useSearchParams` to tell a debates deep link apart from
              an ordinary navigation. */}
          <React.Suspense fallback={null}>
            <DebatesHubGate />
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

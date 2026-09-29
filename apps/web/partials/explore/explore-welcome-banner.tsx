'use client';

import { useDismissedNotice } from '~/core/hooks/use-dismissed-notice';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';

// Persisted alongside the other one-time notices (see `dismissedNoticesAtom`). Once the
// user dismisses the banner this id is appended to the list and it never renders again.
// The id keeps its original `Curator` suffix even though the copy has changed since —
// changing it would re-show the banner to everyone who has already dismissed it.
const WELCOME_BANNER_ID = 'exploreWelcomeCurator';

/**
 * "Welcome to Geo" banner shown above the explore feed. Dismissible
 * via the close button in the top-right; the dismissed state persists in localStorage.
 *
 * Gated behind `ClientOnly` so we never SSR a banner the user has already dismissed
 * (the dismissed state only exists client-side), which would flash on load.
 */
export function ExploreWelcomeBanner() {
  return (
    <ClientOnly>
      <WelcomeBanner />
    </ClientOnly>
  );
}

function WelcomeBanner() {
  const { dismissed, remember: handleDismiss } = useDismissedNotice(WELCOME_BANNER_ID);

  if (dismissed) return null;

  return (
    <div className="relative mb-5 overflow-clip rounded-lg bg-[#151515]">
      {/* Decorative fanned book covers, anchored to the right and bleeding off the top,
          bottom, and right edges (clipped by overflow-clip). Hidden on narrow screens. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-0 translate-x-3 -translate-y-1/2 mobile:hidden"
      >
        <img src="/explore-welcome-banner.png" alt="" className="h-[135px] w-auto max-w-none select-none" />
      </div>

      <div className="relative z-10 py-5 pr-48 pl-5 mobile:pr-5">
        <h2 className="text-smallTitle text-white">
          <span aria-hidden className="mr-1.5">
            👋
          </span>
          Welcome to Geo
        </h2>
        {/* Written for readers, not debaters: both actions are on the feed right below, so there is
            nothing to link to. Recording and matchmaking live in the debates hub for people who go
            looking. */}
        <p className="mt-2 max-w-[338px] text-[16px] leading-[18px] font-normal tracking-[-0.48px] text-white">
          Watch a debate, then decide where you stand by agreeing or disagreeing with the claim.
        </p>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss welcome banner"
        className="absolute top-2.5 right-2.5 z-20 rounded-full border border-white/30 bg-black/40 p-1.5 text-white backdrop-blur-sm transition-colors duration-200 ease-in-out hover:bg-black/60"
      >
        <CloseSmall color="white" />
      </button>
    </div>
  );
}

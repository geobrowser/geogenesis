'use client';

import { useAtom } from 'jotai';

import { useCallback } from 'react';

import { dismissedNoticesAtom } from '~/atoms';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';

// Persisted alongside the other one-time notices (see `dismissedNoticesAtom`). Once the
// user dismisses the banner this id is appended to the list and it never renders again.
const WELCOME_BANNER_ID = 'exploreWelcomeCurator';

/**
 * "Welcome to Geo - Become a curator!" banner shown above the explore feed. Dismissible
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
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  // Functional setter form so concurrent dismissals can't drop each other via a stale
  // closure, and the guard keeps the id from being appended twice on a repeat click.
  const handleDismiss = useCallback(() => {
    setDismissedNotices(prev => (prev.includes(WELCOME_BANNER_ID) ? prev : [...prev, WELCOME_BANNER_ID]));
  }, [setDismissedNotices]);

  if (dismissedNotices.includes(WELCOME_BANNER_ID)) return null;

  return (
    <div className="relative mb-5 overflow-clip rounded-lg bg-[#151515]">
      {/* Decorative fanned book covers, anchored to the right and bleeding off the top,
          bottom, and right edges (clipped by overflow-clip). Hidden on narrow screens.
          NB: breakpoints here are desktop-first (`sm` = max-width 639px), so `sm:hidden`
          hides the covers on small screens while they show by default. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 translate-x-3 sm:hidden"
      >
        <img src="/explore-welcome-banner.png" alt="" className="h-[135px] w-auto max-w-none select-none" />
      </div>

      <div className="relative z-10 py-5 pr-48 pl-5 sm:pr-5">
        <h2 className="text-smallTitle text-white">
          <span aria-hidden className="mr-1.5">
            👋
          </span>
          Welcome to Geo - Become a curator!
        </h2>
        <p className="mt-2 max-w-[400px] text-metadata text-white">
          Help organize topics, questions, claims, and relevant sources to improve the quality of discourse. Join spaces
          and start contributing there.
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

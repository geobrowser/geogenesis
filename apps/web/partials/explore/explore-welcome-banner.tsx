'use client';

import { useCallback } from 'react';

import { useAtom } from 'jotai';

import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';

import { dismissedNoticesAtom } from '~/atoms';

// Persisted alongside the other one-time notices (see `dismissedNoticesAtom`). Once the
// user dismisses the banner this id is appended to the list and it never renders again.
// The id keeps its original `Curator` suffix even though the copy is now debate-focused —
// changing it would re-show the banner to everyone who has already dismissed it.
const WELCOME_BANNER_ID = 'exploreWelcomeCurator';

/**
 * "Welcome to Geo - Find your first debate!" banner shown above the explore feed. Dismissible
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
  const { isOpen: isDebatesHubOpen, open: openDebatesHub } = useDebatesHub();

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
        className="pointer-events-none absolute top-1/2 right-0 translate-x-3 -translate-y-1/2 sm:hidden"
      >
        <img src="/explore-welcome-banner.png" alt="" className="h-[135px] w-auto max-w-none select-none" />
      </div>

      <div className="relative z-10 py-5 pr-48 pl-5 sm:pr-5">
        <h2 className="text-smallTitle text-white">
          <span aria-hidden className="mr-1.5">
            👋
          </span>
          Welcome to Geo - Find your first debate!
        </h2>
        <p className="mt-2 max-w-[338px] text-[16px] leading-[18px] font-normal tracking-[-0.48px] text-white">
          Take a position on claims you care about, then match with someone on the other side. Record the debate and
          publish it. Open the{' '}
          {/* The hub is a panel rather than a route, so this is a button and not a link — there is no
              href to give it. `NavUtils.toDebatesPanel` is for links arriving from elsewhere; from a
              page the hub is already mounted on, opening it directly beats navigating to do it.

              Claims named explicitly rather than leaning on the hook's default, matching "Join a
              debate" in the debate feed: this is where the copy above sends the reader, and it
              shouldn't follow the default if that default is ever retuned for the navbar badge.

              Styled as the inline prose link in the onboarding dialog, in white for the dark ground.
              `button` inherits font and letter-spacing from the base layer, so it reads as part of
              the sentence rather than a control dropped into it.

              `aria-expanded` because the desktop panel is a non-modal aside portaled to the end of
              document.body: it takes no focus and sits nowhere near this sentence in reading order,
              so without it activating this button announces nothing at all. (The mobile sheet traps
              focus, so it announces itself either way.) Reports state rather than promising a
              toggle — this button only ever opens, and the panel carries its own close affordances.
              No `aria-controls` to go with it: the panel unmounts when closed, so the id it would
              point at is absent exactly when the attribute would be read. Same call the navbar
              opener makes. */}
          <button
            type="button"
            aria-expanded={isDebatesHubOpen}
            onClick={() => openDebatesHub('claims')}
            className="text-white underline decoration-white underline-offset-2"
          >
            debate hub
          </button>{' '}
          to get started!
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

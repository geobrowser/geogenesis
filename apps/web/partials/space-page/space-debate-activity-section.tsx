'use client';

import * as React from 'react';

import { SPACE_ACTIVITY_KINDS, SPACE_ACTIVITY_LABELS, spaceActivityFeedHref } from '~/core/space/space-debate-activity';
import {
  useSpaceActivityRows,
  useSpaceDebateActivityCounts,
  useSpaceDebateEligibility,
} from '~/core/space/use-space-debate-activity';

import { type ActivityKind, ProfileActivitySection } from '~/partials/profile/profile-activity-section';

/** Stable, so withholding rows does not rebuild the card's memos on every render. */
const NO_ROWS: ActivityKind['rows'] = [];

/**
 * A space's debate activity, at the top of its Overview.
 *
 * The same card a person's profile leads with, fed from the space instead of from a person: the
 * debates published here and the claims curated here for debating. It is literally the same
 * component — `ProfileActivitySection` takes a list of kinds and knows nothing about whose they
 * are — so the toggle, the gallery, the playable debate cards, the answerable claim cards and the
 * "See all" row behave identically on both surfaces, and a change to either lands on both.
 *
 * Rendered only where the question makes sense. A space is shown this section when the debate
 * acceptor edits it (see `useSpaceDebateEligibility`) *and* there is something to put in it — the
 * card hides itself once both kinds settle empty, so a space that has simply never held a debate
 * gets no heading over blank space. Most spaces are neither, and the eligibility answer is one
 * shared, cached request that gates both of the others, so they cost nothing there.
 */
export function SpaceDebateActivitySection({ spaceId }: { spaceId: string }) {
  const { isEligible, isLoading: isEligibilityLoading } = useSpaceDebateEligibility(spaceId);
  // Held until eligibility settles rather than fired optimistically: on an ineligible space — which
  // is most of them — that would be three requests spent to render nothing.
  const enabled = isEligible && !isEligibilityLoading;

  const debates = useSpaceActivityRows(spaceId, 'debates', enabled);
  const claims = useSpaceActivityRows(spaceId, 'claims', enabled);
  // A failed count is not a reason to hide the gallery — `isCountUnavailable` below says the
  // number could not be read, and the rows are worth showing either way — so `isError` is not read.
  const { counts, isLoading: isCountsLoading } = useSpaceDebateActivityCounts(spaceId, enabled);

  const kinds: ActivityKind[] = React.useMemo(() => {
    const sources = { debates, claims };

    return SPACE_ACTIVITY_KINDS.map(kind => {
      const source = sources[kind];
      const total = counts[kind];

      return {
        key: kind,
        label: SPACE_ACTIVITY_LABELS[kind].label,
        /*
         * Withheld until the count is in.
         *
         * The card decides it has something to show from `rows.length`, and uses `isLoading` only
         * to pick the no-rows skeleton — so rows arriving ahead of the count painted six real
         * debates beside a confident "0". Holding them keeps the skeleton up for the extra moment
         * instead, and costs nothing in practice: the count is one aggregate against two
         * card-selection reads, and lands first.
         *
         * A count that *failed* is settled, not pending, so this releases on an error too — the
         * pill then draws the dash `isCountUnavailable` asks for.
         */
        rows: isCountsLoading ? NO_ROWS : source.rows,
        // A failed count is a dash, not a zero. The rows and the count are separate requests, so
        // the card can hold real debates beside a count that could not be read — and "0 debates"
        // stated confidently over six of them reads as a bug in the page.
        total: total ?? 0,
        isCountUnavailable: total === null && !isCountsLoading,
        // The count is part of the card, so its flight is part of the card's loading state: without
        // this the rows paint under a confident 0 while the count is still out.
        isLoading: source.isLoading || isCountsLoading,
        isError: source.isError,
        href: spaceActivityFeedHref(spaceId, kind),
        // Both destinations are full-bleed — no header, no tab bar — so the fragment has nothing to
        // land on and would only ride along in a copied URL.
        skipTabsAnchor: true,
        seeAllLabel: SPACE_ACTIVITY_LABELS[kind].seeAllLabel,
      } satisfies ActivityKind;
    });
  }, [claims, counts, debates, isCountsLoading, spaceId]);

  // Nothing at all while we do not yet know whether to ask, and nothing on a space the acceptor
  // does not edit. Distinct from the card's own empty state, which is about content rather than
  // eligibility — and a skeleton here would promise a section to every space on the site.
  if (!enabled) return null;

  // The gap under it belongs here rather than in the page, which cannot see whether the card
  // rendered — see the prop's own note.
  return <ProfileActivitySection kinds={kinds} className="mb-10" />;
}

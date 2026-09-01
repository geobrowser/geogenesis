import { cache } from 'react';

import * as Effect from 'effect/Effect';

import { getSpacesWhereMember } from '~/core/io/queries';

/**
 * The spaces a member space belongs to, memoized for the request.
 *
 * `getSpacesWhereMember` is an Effect — a description, not a promise — so memoizing the
 * Effect itself would dedupe nothing: every `Effect.runPromise` would re-run it. The
 * memo has to sit on the resolved promise, which is what this wrapper is for.
 *
 * Two callers ask for exactly this, one after the other, on every signed-in Explore
 * request: `getGovernanceHomeSpaceContext` and `fetchBrowseSidebarSources`. They sit in
 * different sequential stages, so the duplicate was serial latency rather than a
 * concurrent double-fetch. It is not a cheap query to repeat — it pulls the whole
 * `FullSpace` fragment (members list, editors list, topic, page) for every space the user
 * belongs to, measured at ~0.5s and ~20 KB for a user in just three spaces, and it grows
 * with the user's space count.
 *
 * Mirrors `fetchEditorSpaceIds`, which is memoized the same way and for the same reason —
 * it is the other half of both call sites and was already deduped.
 */
export const fetchMemberSpaces = cache(async (memberSpaceId: string) =>
  Effect.runPromise(getSpacesWhereMember(memberSpaceId))
);

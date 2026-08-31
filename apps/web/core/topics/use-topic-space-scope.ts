'use client';

import * as React from 'react';

import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * The spaces a topic page draws its content from: the curated graph, plus wherever the reader
 * currently is.
 *
 * The curated set is the same one the debates surfaces already use — featured spaces, plus the
 * spaces the viewer is a member or editor of, plus their own — assembled by
 * `buildClaimSpaceAllowlist`. Reusing it rather than defining a second notion of "spaces that
 * count" is the point: a claim that shows in the debates panel and the same claim on a topic page
 * should not disagree about whether its space exists.
 *
 * The route's space is added on top, so a topic opened inside a space always shows that space's
 * content even when it isn't curated. That is the half of this that a viewer would notice
 * immediately if it were missing.
 *
 * `undefined` means "don't filter", not "nothing matches", and callers pass it straight through as
 * the query variable — the API treats an absent list as no filter and an empty list as a filter
 * that matches nothing, so the two must never be confused. It is returned while the allowlist is
 * still resolving, which follows `isClaimSpaceAllowed`'s rule: filtering against a half-built list
 * hides content the viewer is entitled to and then flashes it back in, which reads worse than a
 * beat of everything.
 */
export function useTopicSpaceScope(currentSpaceId: string | null | undefined): string[] | undefined {
  const { allowlist } = useClaimSpaceAllowlist();

  return React.useMemo(() => {
    if (allowlist === null) return undefined;

    const ids = new Set(allowlist);
    if (currentSpaceId && validateSpaceId(currentSpaceId)) ids.add(normId(currentSpaceId));

    // Sorted so an unchanged set keeps its query key when the underlying lists reorder.
    const scope = [...ids].sort();

    // An allowlist that resolved to nothing would otherwise become a filter matching nothing and
    // empty the page. There is no such set to express, so express no set.
    return scope.length > 0 ? scope : undefined;
  }, [allowlist, currentSpaceId]);
}

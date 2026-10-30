'use client';

import * as React from 'react';

import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';

import { debatePublishableSpacePredicate } from './debate-publish-target';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from './use-debate-publishable-spaces';

/**
 * Whether a debate could be published in each of `spaceIds`: the acceptor's allowlist above, and the
 * space's own type (`debatePublishableSpacePredicate`). Both, because the allowlist fails open — and
 * agendas, which anyone can publish the type of, would otherwise put a personal space's claims in
 * front of everyone. Shared by the debate-again picker and the Today's claims callout (GEO-3498).
 *
 * `typesPending` is true while any space's type is unresolved: an unresolved type reads as
 * publishable, so until then the predicate admits spaces it will go on to reject.
 */
export function useCanPublishDebateIn(spaceIds: string[], { enabled = true }: { enabled?: boolean } = {}) {
  const { publishableSpaceIds, isLoading: allowlistLoading } = useDebatePublishableSpaces({ enabled });
  const { spacesById, isLoading: typesPending } = useSpacesByIds(spaceIds, enabled);
  const spaceTypePublishable = React.useMemo(() => debatePublishableSpacePredicate(spacesById), [spacesById]);
  const canPublishDebateIn = React.useCallback(
    (spaceId: string | null | undefined) =>
      isSpaceDebatePublishable(spaceId, publishableSpaceIds) && spaceTypePublishable(spaceId),
    [publishableSpaceIds, spaceTypePublishable]
  );
  return { canPublishDebateIn, allowlistLoading, typesPending: enabled && typesPending };
}

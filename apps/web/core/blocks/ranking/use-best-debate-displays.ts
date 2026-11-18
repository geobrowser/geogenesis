'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { useDebateKeyframes } from '~/core/claims/browse/use-debate-keyframes';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { useQueryEntities } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import {
  type BestDebateDisplay,
  bestDebateDisplayFromEntity,
  debatersLabel,
  shortPersonName,
} from './best-debate-display';

/** One Best debates row, resolved: what `BestDebateRow` draws. */
export type BestDebateRowData = BestDebateDisplay & {
  /** The poster still the claim page's debate rows use (Debate videos → Key frame), or null. */
  keyframeUrl: string | null;
  /** "Chris B. and Ben T.", or null until (or unless) the debaters' names are known. */
  debaters: string | null;
  space: { id: string; name: string; image: string | null } | null;
};

const EMPTY: ReadonlyMap<string, BestDebateRowData> = new Map();

/**
 * Display data for the Best debates rows on screen, batched: one entity read for every id, then
 * the keyframes, the debaters' profiles and the debates' own spaces, each once for all of them.
 * Keyed by normalized id. An id whose entity hasn't loaded is missing; callers draw the name they
 * already have.
 */
export function useBestDebateDisplays(
  entityIds: readonly string[],
  enabled = true
): ReadonlyMap<string, BestDebateRowData> {
  const idsKey = [...new Set(entityIds.map(normId).filter(Boolean))].sort().join('|');
  const ids = React.useMemo(() => (idsKey ? idsKey.split('|') : []), [idsKey]);
  const on = enabled && ids.length > 0;

  const { entities } = useQueryEntities({
    enabled: on,
    where: { id: { in: ids } },
    first: ids.length || 1,
    placeholderData: keepPreviousData,
  });
  const debates = React.useMemo(() => (on ? entities : []), [entities, on]);

  const displays = React.useMemo(() => debates.map(bestDebateDisplayFromEntity), [debates]);
  const keyframes = useDebateKeyframes(debates);

  const debaterSpaceIds = React.useMemo(() => [...new Set(displays.flatMap(d => d.debaterSpaceIds))], [displays]);
  const { profilesBySpaceId } = useProfilesBySpaceIds(debaterSpaceIds, debaterSpaceIds.length > 0);

  const ownSpaceIds = React.useMemo(
    () => [...new Set(displays.map(d => d.ownSpaceId).filter((id): id is string => Boolean(id)))],
    [displays]
  );
  const { spacesById } = useSpacesByIds(ownSpaceIds, ownSpaceIds.length > 0);

  return React.useMemo(() => {
    if (displays.length === 0) return EMPTY;
    const keyframeById = new Map([...keyframes].map(([id, url]) => [normId(id), url] as const));
    const spaceById = new Map([...spacesById].map(([id, space]) => [normId(id), space] as const));
    const byId = new Map<string, BestDebateRowData>();
    for (const display of displays) {
      const space = display.ownSpaceId ? spaceById.get(normId(display.ownSpaceId)) : undefined;
      byId.set(display.entityId, {
        ...display,
        keyframeUrl: keyframeById.get(display.entityId) ?? null,
        debaters: debatersLabel(display.debaterSpaceIds.map(id => shortPersonName(profilesBySpaceId.get(id)?.name))),
        space: space?.entity?.name
          ? { id: space.id, name: space.entity.name, image: space.entity.image ?? null }
          : null,
      });
    }
    return byId;
  }, [displays, keyframes, profilesBySpaceId, spacesById]);
}

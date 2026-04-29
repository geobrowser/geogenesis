'use client';

import * as React from 'react';

import { ROOT_SPACE } from '~/core/constants';

import { usePersonalSpaceId } from './use-personal-space-id';
import { useSpaceId } from './use-space-id';

/**
 * Space ids that are always passed as `additional_space_ids` to the REST
 * /search endpoint: root, the user's current space (if any), and the user's
 * personal space (if any). Use this anywhere the REST search api is called
 * from a client component / hook so results from these spaces surface
 * regardless of the active scope.
 */
export function useGlobalSearchSpaceIds(): string[] {
  const currentSpaceId = useSpaceId();
  const { personalSpaceId } = usePersonalSpaceId();

  return React.useMemo(
    () =>
      Array.from(new Set([ROOT_SPACE, currentSpaceId, personalSpaceId].filter((id): id is string => Boolean(id)))),
    [currentSpaceId, personalSpaceId]
  );
}

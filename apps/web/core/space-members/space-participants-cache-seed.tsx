'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type ParticipantKind,
  type SpaceParticipantsPage,
} from './fetch-space-participants-page';
import { seedSpaceParticipantsCache } from './space-participants-cache';

type Props = {
  spaceId: string;
  kind: ParticipantKind;
  page: SpaceParticipantsPage;
};

export function SpaceParticipantsCacheSeed({ spaceId, kind, page }: Props) {
  const queryClient = useQueryClient();

  // Seed in an effect rather than during render — mutating the React Query cache
  // while rendering can warn or loop. Idempotent, so re-running on prop changes is safe.
  React.useEffect(() => {
    seedSpaceParticipantsCache(queryClient, { spaceId, kind, page });
  }, [queryClient, spaceId, kind, page]);

  return null;
}

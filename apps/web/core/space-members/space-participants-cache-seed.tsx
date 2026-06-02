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
  const seededKeyRef = React.useRef<string | null>(null);
  const seedKey = `${spaceId}:${kind}`;

  if (seededKeyRef.current !== seedKey) {
    seedSpaceParticipantsCache(queryClient, { spaceId, kind, page });
    seededKeyRef.current = seedKey;
  }

  return null;
}

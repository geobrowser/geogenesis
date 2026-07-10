import { cache } from 'react';

import { Effect } from 'effect';

import {
  type ParticipantKind,
  SPACE_PARTICIPANTS_PAGE_SIZE,
  type SpaceParticipantsPage,
  fetchSpaceParticipantsPage,
} from './fetch-space-participants-page';
import { Telemetry } from '~/app/api/telemetry';

export const getCachedSpaceParticipantsPage = cache(
  async (
    spaceId: string,
    kind: ParticipantKind,
    offset: number,
    limit: number = SPACE_PARTICIPANTS_PAGE_SIZE
  ): Promise<SpaceParticipantsPage> => {
    return Effect.runPromise(
      fetchSpaceParticipantsPage({ spaceId, kind, offset, limit }).pipe(
        Effect.withSpan('web.getCachedSpaceParticipantsPage'),
        Effect.annotateSpans({ spaceId, kind, offset, limit }),
        Effect.provide(Telemetry)
      )
    );
  }
);

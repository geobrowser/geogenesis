import { cache } from 'react';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { getIsEditorOfSpace } from '~/core/io/queries';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';

import { Telemetry } from '~/app/api/telemetry';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

import { getCachedSpaceParticipantsPage } from './get-cached-space-participants-page';
import {
  type SpaceParticipantProfile,
  type SpaceParticipantsPage,
} from './fetch-space-participants-page';

export type SpaceEditorsBootstrap = {
  isEditor: boolean;
  totalEditors: number;
  firstThreeEditors: SpaceParticipantProfile[];
  initialParticipantsPage: SpaceParticipantsPage;
};

function editorListIsComplete(totalEditors: number, loadedEditorCount: number): boolean {
  return totalEditors <= loadedEditorCount;
}

export const getSpaceEditorsBootstrap = cache(
  async (spaceId: string, connectedAddress?: string): Promise<SpaceEditorsBootstrap> => {
    const space = await cachedFetchSpace(spaceId);

    if (!space) {
      console.error(`Space does not exist: ${spaceId}`);
      notFound();
    }

    const personalSpaceId = connectedAddress ? await getPersonalSpaceId(connectedAddress) : null;
    const normalizedPersonalSpaceId = personalSpaceId?.toLowerCase() ?? null;

    if (space.type === 'PERSONAL' && normalizedPersonalSpaceId) {
      const isOwner = normalizedPersonalSpaceId === spaceId.toLowerCase();
      const initialParticipantsPage = await getCachedSpaceParticipantsPage(spaceId, 'editors', 0);

      return {
        isEditor: isOwner,
        totalEditors: initialParticipantsPage.totalCount,
        firstThreeEditors: initialParticipantsPage.participants.slice(0, 3),
        initialParticipantsPage,
      };
    }

    const needsEditorshipQuery =
      Boolean(normalizedPersonalSpaceId) &&
      !editorListIsComplete(space.totalEditors, space.editors.length);

    const [initialParticipantsPage, isEditorFromQuery] = await Promise.all([
      getCachedSpaceParticipantsPage(spaceId, 'editors', 0),
      needsEditorshipQuery && normalizedPersonalSpaceId
        ? Effect.runPromise(
            getIsEditorOfSpace(spaceId, normalizedPersonalSpaceId).pipe(
              Effect.withSpan('web.getSpaceEditorsBootstrap.isEditor'),
              Effect.annotateSpans({ spaceId, personalSpaceId: normalizedPersonalSpaceId }),
              Effect.provide(Telemetry)
            )
          )
        : Promise.resolve(false),
    ]);

    let isEditor = isEditorFromQuery;
    if (normalizedPersonalSpaceId && !needsEditorshipQuery) {
      isEditor = space.editors.some(e => e.toLowerCase() === normalizedPersonalSpaceId);
    }

    return {
      isEditor,
      totalEditors: initialParticipantsPage.totalCount,
      firstThreeEditors: initialParticipantsPage.participants.slice(0, 3),
      initialParticipantsPage,
    };
  }
);

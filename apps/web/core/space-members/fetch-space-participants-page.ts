import { Effect } from 'effect';

import { getSpaceEditorsPage, getSpaceMembersPage } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { OmitStrict, Profile } from '~/core/types';

export const SPACE_PARTICIPANTS_PAGE_SIZE = 50;

export type ParticipantKind = 'members' | 'editors';

export type SpaceParticipantProfile = OmitStrict<Profile, 'coverUrl'>;

export type SpaceParticipantsPage = {
  participants: SpaceParticipantProfile[];
  totalCount: number;
  nextOffset: number | null;
};

export function fetchSpaceParticipantsPage({
  spaceId,
  kind,
  offset,
  limit = SPACE_PARTICIPANTS_PAGE_SIZE,
  signal,
}: {
  spaceId: string;
  kind: ParticipantKind;
  offset: number;
  limit?: number;
  signal?: AbortController['signal'];
}): Effect.Effect<SpaceParticipantsPage, unknown> {
  return Effect.gen(function* () {
    const loader = kind === 'members' ? getSpaceMembersPage : getSpaceEditorsPage;
    const page = yield* loader(spaceId, { first: limit, offset }, signal);
    const profiles = yield* fetchProfilesBySpaceIds(page.memberSpaceIds);
    const consumed = offset + page.memberSpaceIds.length;
    const nextOffset = consumed < page.totalCount && page.memberSpaceIds.length > 0 ? consumed : null;
    return {
      participants: profiles,
      totalCount: page.totalCount,
      nextOffset,
    };
  });
}

import {
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import {
  type ParticipantKind,
  SPACE_PARTICIPANTS_PAGE_SIZE,
  type SpaceParticipantsPage,
} from './fetch-space-participants-page';

export function spaceParticipantsQueryKey(
  spaceId: string,
  kind: ParticipantKind,
  pageSize: number = SPACE_PARTICIPANTS_PAGE_SIZE
) {
  return ['space-participants', spaceId, kind, pageSize] as const;
}

export type SpaceParticipantsInfiniteData = InfiniteData<SpaceParticipantsPage, number>;

export function getCachedParticipantsPage(
  queryClient: QueryClient,
  spaceId: string,
  kind: ParticipantKind,
  offset: number,
  pageSize: number = SPACE_PARTICIPANTS_PAGE_SIZE
): SpaceParticipantsPage | undefined {
  const data = queryClient.getQueryData<SpaceParticipantsInfiniteData>(
    spaceParticipantsQueryKey(spaceId, kind, pageSize)
  );
  if (!data) return undefined;
  const index = data.pageParams.findIndex(p => p === offset);
  if (index < 0) return undefined;
  return data.pages[index];
}

export function writeParticipantsPageToCache(
  queryClient: QueryClient,
  {
    spaceId,
    kind,
    page,
    offset,
    pageSize = SPACE_PARTICIPANTS_PAGE_SIZE,
  }: {
    spaceId: string;
    kind: ParticipantKind;
    page: SpaceParticipantsPage;
    offset: number;
    pageSize?: number;
  }
) {
  const queryKey = spaceParticipantsQueryKey(spaceId, kind, pageSize);
  const existing = queryClient.getQueryData<SpaceParticipantsInfiniteData>(queryKey);

  if (!existing) {
    queryClient.setQueryData<SpaceParticipantsInfiniteData>(
      queryKey,
      { pages: [page], pageParams: [offset] },
      { updatedAt: Date.now() }
    );
    return;
  }

  const index = existing.pageParams.findIndex(p => p === offset);
  if (index >= 0) {
    const pages = [...existing.pages];
    pages[index] = page;
    queryClient.setQueryData<SpaceParticipantsInfiniteData>(
      queryKey,
      { pages, pageParams: existing.pageParams },
      { updatedAt: Date.now() }
    );
    return;
  }

  queryClient.setQueryData<SpaceParticipantsInfiniteData>(
    queryKey,
    {
      pages: [...existing.pages, page],
      pageParams: [...existing.pageParams, offset],
    },
    { updatedAt: Date.now() }
  );
}

/** Store server-loaded side panel page 0 in the client cache */
export function seedSpaceParticipantsCache(
  queryClient: QueryClient,
  {
    spaceId,
    kind,
    page,
    pageSize = SPACE_PARTICIPANTS_PAGE_SIZE,
  }: {
    spaceId: string;
    kind: ParticipantKind;
    page: SpaceParticipantsPage;
    pageSize?: number;
  }
) {
  writeParticipantsPageToCache(queryClient, { spaceId, kind, page, offset: 0, pageSize });
}

export const MAX_SEARCH_ADDITIONAL_SPACE_IDS = 100;

export function buildGlobalSearchSpaceIds({
  rootSpaceId,
  currentSpaceId,
  personalSpaceId,
  memberAndEditorSpaceIds,
}: {
  rootSpaceId: string;
  currentSpaceId: string | null | undefined;
  personalSpaceId: string | null | undefined;
  memberAndEditorSpaceIds: string[];
}): string[] {
  return Array.from(
    new Set(
      [rootSpaceId, currentSpaceId, personalSpaceId, ...memberAndEditorSpaceIds].filter(
        (id): id is string => Boolean(id)
      )
    )
  ).slice(0, MAX_SEARCH_ADDITIONAL_SPACE_IDS);
}

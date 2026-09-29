import { normId } from '~/core/utils/norm-id';

/**
 * Profile space ids kept off the People tab, online or offline. A hand-kept list of accounts
 * that would otherwise show up as people to debate or schedule with. Remove an id to list them again.
 */
const HIDDEN_PROFILE_SPACE_IDS = new Set([
  '879dc356d44f41ffbefae156d1db31c2', // Bryan 0811
  '0c6b9f616d53429b8f61f1a1edd72bd2', // Juan1
]);

export function isHiddenFromPeopleTab(profileSpaceId: string | null | undefined): boolean {
  return !!profileSpaceId && HIDDEN_PROFILE_SPACE_IDS.has(normId(profileSpaceId));
}

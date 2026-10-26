import { spaceIdMatcher } from '~/core/utils/space-id-matcher';

/**
 * Personal spaces kept off the debates hub People tab, both the online list and the offline list of
 * people to schedule with.
 *
 * A hard-coded list by design: there is no on-graph flag or geo-chat setting for "don't list me", so
 * until there is, the list lives here — the same approach as `curator-leaderboard-exclusions`.
 *
 * Entries are personal space ids, in any format. To add someone: put their personal space id in this
 * array with a comment saying who it is.
 */
export const EXCLUDED_PEOPLE_TAB_SPACE_IDS: readonly string[] = [
  '879dc356d44f41ffbefae156d1db31c2', // Bryan 0811
  '0c6b9f616d53429b8f61f1a1edd72bd2', // Juan1
];

/** Whether this personal space is one the People tab leaves out. */
export const isExcludedFromPeopleTab = spaceIdMatcher(EXCLUDED_PEOPLE_TAB_SPACE_IDS);

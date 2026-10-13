import type { ExplorePageSort } from '~/core/explore/explore-feed-params';
import type { ExploreTime } from '~/core/explore/fetch-explore-feed';

/**
 * `EntityFeed`'s pages query key. Its own module, not the client component's, so a server route
 * seeding a first page (see `app/explore/page.tsx`) builds the very key the feed will look under.
 *
 * Keyed on what is actually sent: two Best feeds differing only in a hidden range are the same
 * request, and caching them apart would refetch on a change the viewer never made.
 */
export function entityFeedQueryKey(args: {
  apiEndpoint: string;
  sort: ExplorePageSort;
  time: ExploreTime | undefined;
  spaceIdsKey: string;
  typeIdsKey: string | null;
  topicIdsKey: string;
  fixedParamsKey: string;
  smartAccountAddress: string | null;
  followedTopicIdsKey: string;
}): readonly unknown[] {
  return [
    args.apiEndpoint,
    args.sort,
    args.time,
    args.spaceIdsKey,
    args.typeIdsKey,
    args.topicIdsKey,
    args.fixedParamsKey,
    args.smartAccountAddress,
    // Only on For you, so every other sort's key, and so its cache, is unchanged.
    ...(args.sort === 'for-you' ? [args.followedTopicIdsKey] : []),
  ];
}

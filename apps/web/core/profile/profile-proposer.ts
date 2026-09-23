import type { Profile } from '~/core/types';

/**
 * The byline for a person's proposals, when the graph has no profile row yet.
 *
 * Every row on that tab was proposed by the same person — the one whose profile
 * it is — so the proposer is resolved once and handed down rather than read per
 * row. Where the lookup comes back empty the rows still render, unnamed, which
 * is better than a tab that refuses to draw.
 *
 * Shared because the tab has two callers now: the route resolves the profile on
 * the server, and the record tabs resolve it in the browser, and a fallback that
 * differed between them would give the same person two bylines depending on
 * which door you came through.
 */
export function fallbackProposer(spaceId: string): Profile {
  return {
    id: spaceId,
    spaceId,
    name: null,
    avatarUrl: null,
    coverUrl: null,
    address: spaceId as `0x${string}`,
    profileLink: null,
  };
}

/**
 * Whether a record tab is worth offering.
 *
 * A tab leading to "No proposals yet" is a promise the profile cannot keep —
 * most people have never opened one — so an empty record loses its tab. Both
 * tab bars ask this: `buildSpaceTabs` for the space route's header, and
 * `ProfileRecordTabs` for the two surfaces that have no header to put one in.
 *
 * **Unknown is not empty.** The counts come from a request that can fail, and
 * hiding a tab holding hundreds of rows is the one outcome worse than showing
 * one holding none — so null and undefined both offer the tab.
 *
 * **The two callers can disagree about Positions, and that is not a bug here.**
 * They feed this the counts they can afford. `ProfileRecordTabs` runs in the
 * browser and reads the vote table, so it knows a retracted position is not one;
 * the space route's bar is server-rendered with the header and has only
 * `entitiesConnection(votedBy:)`, which counts the retraction. So a person whose
 * every position has been taken back keeps the tab on their space page and loses
 * it in the panel. GEO-2962 asks for the `votedByTypes` argument that would let
 * the server answer the same way; until it lands, the divergence is the cost of
 * a server-rendered tab bar rather than something to paper over on one side.
 */
export function hasRecordToShow(count: number | null | undefined): boolean {
  return count === null || count === undefined || count > 0;
}

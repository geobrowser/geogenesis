'use client';

import * as React from 'react';

/**
 * The ballot the ranking screen is editing (GEO-3679): its current draft, and a way to publish a
 * new order of it. When push-down runs on the ranking screen it has to edit this draft, not
 * re-publish the last published ballot: the draft can hold unpublished changes, and publishing
 * the stale ballot would wipe them, then the next Publish would put the pushed-down debate back.
 */
export type ComposeBallot = {
  /** The draft, in order. */
  orderedIds: readonly string[];
  /**
   * Makes `orderedIds` the draft and publishes it as the member's ballot. Resolves true once
   * published, false when it didn't (the screen reports why).
   */
  publish: (orderedIds: string[]) => Promise<boolean>;
};

export const RankingComposeBallotContext = React.createContext<ComposeBallot | null>(null);

export function useRankingComposeBallot(): ComposeBallot | null {
  return React.useContext(RankingComposeBallotContext);
}

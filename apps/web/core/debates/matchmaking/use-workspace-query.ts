'use client';

import { useAtomValue } from 'jotai';

import { toClaimsFilterSearch } from './claims-filter-params';
import { CLAIMS_TAB_VARIANTS, type ClaimsTabVariant, DEFAULT_WORKSPACE_LIST, VARIANT_ATOMS } from './claims-tab';

/** The full-screen hub (GEO-2726). */
export const WORKSPACE_PATH = '/matchmaking';

/** Whether a hub tab is one of the lists the workspace can open on, rather than People or Requests. */
export function isWorkspaceList(tab: string): tab is ClaimsTabVariant {
  return (CLAIMS_TAB_VARIANTS as readonly string[]).includes(tab);
}

export function workspaceHref(query: string): string {
  return query ? `${WORKSPACE_PATH}?${query}` : WORKSPACE_PATH;
}

/**
 * The workspace query for a list and whatever the viewer has narrowed it by.
 *
 * One source for both ends of the link: the panel's "Open full screen" builds it from the tab it is
 * on, and the workspace writes it back as the viewer changes things (GEO-3298). Built separately,
 * the two could drift into different URLs for the same view. `null` — a tab with no workspace list —
 * is a bare `/matchmaking`.
 */
export function useWorkspaceQuery(list: ClaimsTabVariant | null): string {
  const atoms = VARIANT_ATOMS[list ?? DEFAULT_WORKSPACE_LIST];
  const search = useAtomValue(atoms.search);
  const spaceIds = useAtomValue(atoms.spaceIds);
  const topicIds = useAtomValue(atoms.topicIds);

  if (!list) return '';

  return toClaimsFilterSearch({ list, search, spaceIds, topicIds }, DEFAULT_WORKSPACE_LIST);
}

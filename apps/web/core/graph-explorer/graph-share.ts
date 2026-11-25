import type { ActionContext } from '~/core/action-context';
import { copyShareLink, observeShareLinkHandoff } from '~/core/sharing/share-handoff';
import { type ShareAttribution, type ShareMethod, createShareLink, parseShareLink } from '~/core/sharing/share-link';

import { graphExplorerCanonicalHref, graphExplorerCardHref } from './href';
import type { GraphKindFilter } from './select-graph';

export type GraphShareIds = { entityId: string; topicId: string; spaceId?: string | null };

/**
 * The link a share hands out: centre, topic, space and the chip in view (`kinds`), so a filtered
 * view opens filtered. The trail and other filters stay behind.
 */
export function graphShareUrl(origin: string, ids: GraphShareIds, kindFilter: GraphKindFilter = 'all') {
  const href = graphExplorerCanonicalHref(ids);
  return `${origin}${href}${kindFilter === 'all' ? '' : `&kinds=${kindFilter}`}`;
}

const warmed = new Set<string>();

/**
 * Renders the card ahead of the crawler that unfurls the link (a topic card takes seconds cold).
 * Fire-and-forget, once per URL per page load; errors are ignored.
 */
export function warmGraphCard(ids: GraphShareIds, fetchImpl: typeof fetch = fetch) {
  const url = graphExplorerCardHref(ids);
  if (warmed.has(url)) return;
  warmed.add(url);
  try {
    void fetchImpl(url, { priority: 'low' } as RequestInit).catch(() => {});
  } catch {
    // Warming is best effort.
  }
}

export type GraphShareResult = 'copied' | 'shared' | 'cancelled';

/**
 * Phones get the native share sheet and fall back to copying; elsewhere the link is copied. Either
 * way the share is recorded as a `graph` share and the card is warmed.
 */
export async function shareGraph(
  ids: GraphShareIds,
  context: ActionContext,
  { nativeShare, kindFilter = 'all' }: { nativeShare: boolean; kindFilter?: GraphKindFilter }
): Promise<GraphShareResult> {
  const url = graphShareUrl(window.location.origin, ids, kindFilter);
  const link = (method: ShareMethod) => createShareLink(url, 'graph', ids.entityId, method);
  warmGraphCard(ids);
  if (nativeShare && typeof navigator.share === 'function') {
    const shared = link('native_share');
    const handoff = observeShareLinkHandoff(shared, context);
    try {
      await navigator.share({ url: shared.url });
      handoff('composer_requested');
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // No share sheet after all: copy instead.
    }
  }
  await copyShareLink(link('copy_link'), context);
  return 'copied';
}

let landingShare: ShareAttribution | null = null;

/**
 * Reads the graph share this page load arrived through. The tags stay in the URL: the analytics
 * runtime reads them from it when it loads, which can be after the page has settled.
 */
export function recordGraphShareLanding() {
  if (typeof window === 'undefined') return;
  const attribution = parseShareLink(window.location.href);
  landingShare = attribution?.share_content_type === 'graph' ? attribution : null;
}

/** The graph share this page load arrived through, for the explorer's own events. */
export function graphShareLanding() {
  return landingShare;
}

/**
 * The in-app pages with an "Explore graph" link, one per entity template (GEO-3866). Sent as
 * `graph_explorer_opened.entry_point`, a free string in the analytics registry.
 */
export const GRAPH_EXPLORER_ENTRY_POINTS = [
  'topic_page',
  'claim_page',
  'event_page',
  'news_story_page',
  'source_page',
  'post_page',
  'podcast_show_page',
  'podcast_episode_page',
] as const;
export type GraphExplorerEntryPoint = (typeof GRAPH_EXPLORER_ENTRY_POINTS)[number];

const ENTRY_TTL_MS = 60_000;
let pendingEntry: { entryPoint: GraphExplorerEntryPoint; at: number } | null = null;

/** Set by an in-app link into the explorer, in memory so a copied URL never claims it. */
export function markGraphExplorerEntry(entryPoint: GraphExplorerEntryPoint) {
  pendingEntry = { entryPoint, at: Date.now() };
}

/** The in-app entry point within the last minute, consumed once. */
export function takeGraphExplorerEntry(): GraphExplorerEntryPoint | null {
  const entry = pendingEntry;
  pendingEntry = null;
  return entry && Date.now() - entry.at <= ENTRY_TTL_MS ? entry.entryPoint : null;
}

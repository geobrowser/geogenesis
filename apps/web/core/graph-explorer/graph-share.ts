import type { ActionContext } from '~/core/action-context';
import { copyShareLink, observeShareLinkHandoff } from '~/core/sharing/share-handoff';
import { type ShareAttribution, type ShareMethod, createShareLink, parseShareLink } from '~/core/sharing/share-link';

import { graphExplorerCanonicalHref, graphExplorerCardHref } from './href';

export type GraphShareIds = { entityId: string; topicId: string; spaceId?: string | null };

/** The link a share hands out: centre, topic and space only; the trail and filters stay behind. */
export function graphShareUrl(origin: string, ids: GraphShareIds) {
  return `${origin}${graphExplorerCanonicalHref(ids)}`;
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
  { nativeShare }: { nativeShare: boolean }
): Promise<GraphShareResult> {
  const url = graphShareUrl(window.location.origin, ids);
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

const ENTRY_TTL_MS = 60_000;
let pendingEntry: { entryPoint: 'topic_page'; at: number } | null = null;

/** Set by an in-app link into the explorer, in memory so a copied URL never claims it. */
export function markGraphExplorerEntry(entryPoint: 'topic_page') {
  pendingEntry = { entryPoint, at: Date.now() };
}

/** The in-app entry point within the last minute, consumed once. */
export function takeGraphExplorerEntry(): 'topic_page' | null {
  const entry = pendingEntry;
  pendingEntry = null;
  return entry && Date.now() - entry.at <= ENTRY_TTL_MS ? entry.entryPoint : null;
}

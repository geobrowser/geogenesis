import type { ActionContext } from '~/core/action-context';
import { afterAnalyticsRuntime, skipPageViewFor } from '~/core/analytics';
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

const SHARE_TAG = /^(si|utm_.+)$/;

let landingShare: ShareAttribution | null = null;

/** The graph share this page load arrived through, read before the tags left the URL. */
export function graphShareLanding() {
  return landingShare;
}

/**
 * After a landing, takes `si` and `utm_*` out of the URL bar so a re-share from it doesn't credit the
 * original sharer. Waits for the analytics runtime, which reads the landing tags, and keeps the page
 * view as it was.
 */
export function stripLandingShareTags() {
  if (typeof window === 'undefined') return;
  const landed = window.location.href;
  const attribution = parseShareLink(landed);
  if (attribution?.share_content_type === 'graph') landingShare = attribution;
  if (![...new URL(landed).searchParams.keys()].some(key => SHARE_TAG.test(key))) return;
  afterAnalyticsRuntime(() => {
    // Only the page that landed, and only if nothing has navigated since.
    if (window.location.href !== landed) return;
    const url = new URL(landed);
    for (const key of [...url.searchParams.keys()]) if (SHARE_TAG.test(key)) url.searchParams.delete(key);
    skipPageViewFor(url.toString());
    window.history.replaceState(window.history.state, '', url.toString());
  });
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

import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { exploreItemTypeKey } from '~/core/explore/explore-diversity';
import { normId } from '~/core/utils/norm-id';

import { SEEN_DEMOTION_VERSION, type SeenDemotionPageConfig } from './seen-demotion-config';
import { type SeenSnapshot, isSeenWithoutEngagement } from './seen-store';

/**
 * Composes one Best page for this visitor (GEO-3234 v2), in the browser, from data already loaded.
 *
 * **What hides.** A card seen without engagement (`isSeen`) is left out. Engaged cards are never
 * seen, so never hidden.
 *
 * **What fills.** Every position keeps the type Best gave it (GEO-2950 mix, held position by
 * position). A position takes the next card of its type that is not hidden and not already shown,
 * first from the page itself, then from the `reserve`: the rows that follow the page in the same Best
 * window, which the server sent along with it. No request is made. A type with nothing left in the
 * reserve leaves its position out, so the page comes up short rather than changing its mix.
 *
 * **No repeats.** `shown` holds every id an earlier page put on screen; a page skips those, and the
 * caller adds this page's ids afterwards. The reserve is the next page's head, so this is what stops
 * a card appearing on both. The result depends only on the pages, the snapshot (frozen for the
 * session) and the clock the caller pins, so recomputing it gives the same feed.
 *
 * **Debates.** Seen debates are hidden while an unseen one remains among the page and its reserve.
 * Once every debate on offer has been seen they all show, in plain Best order.
 *
 * **Lead.** On the first page, the newest unseen debate the server verified playable (GEO-3070) takes
 * position 0, even over an unseen lead that is older, so a new debate opens the feed as soon as it
 * ranks into the checked set. With no unseen playable debate the server's lead stays: the lead rule
 * wins over hiding. Fresh-slot cards (GEO-3221) keep their positions and are never hidden.
 */
export function hideSeenInPage<T>(args: {
  items: readonly T[];
  reserve: readonly T[];
  shown: ReadonlySet<string>;
  idOf: (item: T) => string;
  isSeen: (item: T) => boolean;
  typeOf: (item: T) => string;
  isPinned: (item: T) => boolean;
  /** Debates are the one type that stops being hidden once all are seen. */
  isDebate: (item: T) => boolean;
  /** Whether position 0 holds the verified lead debate (first page only). */
  hasLead: boolean;
  canLead: (item: T) => boolean;
  createdAtSec: (item: T) => number;
}): { items: T[]; hidden: number } {
  const { items, shown, idOf } = args;
  const hasLead = args.hasLead && items.length > 0 && !args.isPinned(items[0]!);

  // The pool: the page, then the reserve, each card once, nothing already on screen.
  const claimed = new Set<string>();
  const pool: { item: T; fromPage: boolean }[] = [];
  const add = (item: T, fromPage: boolean) => {
    const id = normId(idOf(item));
    if (claimed.has(id) || shown.has(id) || args.isPinned(item)) return;
    claimed.add(id);
    pool.push({ item, fromPage });
  };
  items.forEach(item => add(item, true));
  args.reserve.forEach(item => add(item, false));

  const debates = pool.filter(entry => args.isDebate(entry.item));
  const allDebatesSeen = debates.length > 0 && debates.every(entry => args.isSeen(entry.item));
  const hides = (item: T) => args.isSeen(item) && !(args.isDebate(item) && allDebatesSeen);

  // Per type, in rank order, what can still be placed.
  const queues = new Map<string, T[]>();
  for (const { item } of pool) {
    if (hides(item)) continue;
    const type = args.typeOf(item);
    queues.set(type, [...(queues.get(type) ?? []), item]);
  }
  const take = (type: string, id?: string): T | undefined => {
    const queue = queues.get(type);
    if (!queue) return undefined;
    const at = id === undefined ? 0 : queue.findIndex(item => normId(idOf(item)) === id);
    return at < 0 || at >= queue.length ? undefined : queue.splice(at, 1)[0];
  };

  // The lead: newest unseen playable debate on offer, else the server's.
  let lead: T | undefined;
  if (hasLead) {
    const first = items[0]!;
    const unseen = pool.filter(entry => args.canLead(entry.item) && !args.isSeen(entry.item));
    let best: T | undefined;
    for (const { item } of unseen) {
      if (best === undefined || args.createdAtSec(item) > args.createdAtSec(best)) best = item;
    }
    lead = best ?? (shown.has(normId(idOf(first))) ? undefined : first);
    if (lead !== undefined) take(args.typeOf(lead), normId(idOf(lead)));
  }

  const out: T[] = [];
  items.forEach((slot, index) => {
    if (args.isPinned(slot)) {
      if (!shown.has(normId(idOf(slot)))) out.push(slot);
      return;
    }
    if (hasLead && index === 0) {
      if (lead !== undefined) out.push(lead);
      return;
    }
    const placed = take(args.typeOf(slot));
    if (placed !== undefined) out.push(placed);
  });

  const placedIds = new Set(out.map(item => normId(idOf(item))));
  const hidden = pool.filter(entry => entry.fromPage && !placedIds.has(normId(idOf(entry.item))) && hides(entry.item));
  return { items: out, hidden: hidden.length };
}

/**
 * The feed's pages composed in order: {@link hideSeenInPage} for each page that carries a config,
 * threading `shown` through so no card appears twice. A page without a config (seen hiding off, or
 * not plain Best) passes through untouched, and its cards still count as shown. With no snapshot (no
 * storage) nothing is hidden and nothing changes. Cards on a composed page report
 * `<version>+seen.<n>` and, when any were hidden, how many (`seenHidden`).
 */
export function composeSeenPages(
  pages: readonly {
    items: readonly ExploreFeedItem[];
    reserve?: readonly ExploreFeedItem[];
    config: SeenDemotionPageConfig | null;
  }[],
  args: { snapshot: SeenSnapshot | null; nowSec: number }
): ExploreFeedItem[] {
  const shown = new Set<string>();
  const flat: ExploreFeedItem[] = [];
  pages.forEach((page, index) => {
    const { config } = page;
    const { snapshot } = args;
    if (!config || !snapshot || page.items.length === 0) {
      for (const item of page.items) shown.add(normId(item.entityId));
      flat.push(...page.items);
      return;
    }
    const result = hideSeenInPage<ExploreFeedItem>({
      items: page.items,
      reserve: Array.isArray(page.reserve) ? page.reserve : [],
      shown,
      idOf: item => item.entityId,
      isSeen: item => isSeenWithoutEngagement(snapshot, item.entityId, config, args.nowSec),
      typeOf: exploreItemTypeKey,
      isPinned: item => item.ranking?.slot === 'fresh',
      isDebate: item => exploreItemTypeKey(item) === normId(DEBATE_TYPE_ID),
      hasLead: index === 0 && page.items[0]?.playableLead === true,
      canLead: item => item.playableLead === true,
      createdAtSec: item => item.createdAtSec,
    });
    for (const item of result.items) {
      shown.add(normId(item.entityId));
      const version = item.ranking?.version;
      flat.push(
        version
          ? {
              ...item,
              ranking: {
                ...item.ranking!,
                version: `${version}+seen.${SEEN_DEMOTION_VERSION}`,
                ...(result.hidden > 0 ? { seenHidden: result.hidden } : {}),
              },
            }
          : item
      );
    }
  });
  return flat;
}

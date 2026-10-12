import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { exploreItemTypeKey } from '~/core/explore/explore-diversity';

import { SEEN_DEMOTION_VERSION, type SeenDemotionPageConfig } from './seen-demotion-config';
import { type SeenSnapshot, isSeenWithoutEngagement } from './seen-store';

/**
 * Reorders one page of Best for this visitor (GEO-3234), in the browser, on a page already loaded.
 *
 * **Why one page, not Best's window.** The server cuts each page from a ~66-row window by offset
 * and sends only that page; the browser never holds the window. Moving a card between pages would
 * need the next page before showing this one, or would duplicate or skip cards as the scroll
 * catches up. A permutation of each page cannot do either, so paging and dedupe hold by
 * construction, and the server's response, and every cache in front of it, stay the same for
 * everyone.
 *
 * **What moves.** A card seen without engagement (`isDemoted`) moves after the unseen cards *of its
 * own type* on the page: every position keeps the type Best gave it, so the type mix (GEO-2950)
 * holds position by position, and the page's per-space counts are unchanged. Relative order is
 * kept among the cards that stay and among the cards that move.
 *
 * **What does not.** Fresh-slot cards (GEO-3221) keep their positions. On the first page, a lead
 * debate the server verified playable (GEO-3070) keeps the first position; if the visitor has
 * already seen it, the highest unseen debate on the page that the server also verified playable
 * takes its place, and the old lead moves down like any other seen card. With no such debate the
 * lead stays, unmarked: the lead rule wins.
 */
export function demoteSeenInPage<T>(
  items: readonly T[],
  options: {
    isDemoted: (item: T) => boolean;
    typeOf: (item: T) => string;
    /** Fresh-slot cards: never moved. */
    isPinned: (item: T) => boolean;
    /** Whether position 0 holds the verified lead debate (first page only). */
    hasLead: boolean;
    /** A debate the server verified playable, so it may lead. */
    canLead: (item: T) => boolean;
  }
): { items: T[]; demoted: Set<number> } {
  const demotedFlags = items.map(item => options.isDemoted(item));
  const pinned = items.map(item => options.isPinned(item));
  // A fresh card never leads (the fresh slot starts at position 2), but if one ever did, treating
  // it as the lead would drop a card from the page.
  const hasLead = options.hasLead && items.length > 0 && !pinned[0];

  // Which card leads: the lead itself, or, once seen, the highest unseen playable card of its type.
  let lead = -1;
  if (hasLead) {
    lead = 0;
    if (demotedFlags[0]) {
      const leadType = options.typeOf(items[0]!);
      const replacement = items.findIndex(
        (item, index) =>
          index > 0 &&
          !demotedFlags[index] &&
          !pinned[index] &&
          options.canLead(item) &&
          options.typeOf(item) === leadType
      );
      if (replacement > 0) lead = replacement;
    }
  }

  // Positions that move: everything but the lead's slot and the fresh slots. Each keeps its type.
  const positions: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    if (!pinned[index] && !(hasLead && index === 0)) positions.push(index);
  }

  // Per type, in rank order: the cards that stay, then the cards that move. A replaced lead is a
  // moving card at its own rank, so it trails the page's unseen debates but precedes the other
  // seen ones; the replacement's position (same type) is what makes room for it.
  const queues = new Map<string, { stay: number[]; move: number[] }>();
  for (let index = 0; index < items.length; index += 1) {
    if (pinned[index] || index === lead) continue;
    const type = options.typeOf(items[index]!);
    const queue = queues.get(type) ?? { stay: [], move: [] };
    (demotedFlags[index] ? queue.move : queue.stay).push(index);
    queues.set(type, queue);
  }

  const out = [...items];
  const demoted = new Set<number>();
  if (hasLead) out[0] = items[lead]!;
  const taken = new Map<string, number>();
  for (const position of positions) {
    const type = options.typeOf(items[position]!);
    const queue = queues.get(type)!;
    const next = taken.get(type) ?? 0;
    taken.set(type, next + 1);
    const source = next < queue.stay.length ? queue.stay[next]! : queue.move[next - queue.stay.length]!;
    out[position] = items[source]!;
    if (demotedFlags[source]) demoted.add(position);
  }

  return { items: out, demoted };
}

/**
 * One Best page as this visitor sees it: {@link demoteSeenInPage} with Explore's card fields, and
 * every card's `ranking` marked so analytics can tell the pages apart. A card that was subject to
 * demotion carries `seenDemoted`; every card on the page reports `<version>+seen.<n>`. With no
 * config (off, or not Best) or no snapshot (no storage), the page comes back untouched.
 */
export function applySeenDemotion(
  items: readonly ExploreFeedItem[],
  args: {
    config: SeenDemotionPageConfig | null;
    snapshot: SeenSnapshot | null;
    firstPage: boolean;
    nowSec: number;
  }
): readonly ExploreFeedItem[] {
  const { config, snapshot } = args;
  if (!config || !snapshot || items.length === 0) return items;

  const result = demoteSeenInPage(items, {
    isDemoted: item => isSeenWithoutEngagement(snapshot, item.entityId, config, args.nowSec),
    typeOf: exploreItemTypeKey,
    isPinned: item => item.ranking?.slot === 'fresh',
    hasLead: args.firstPage && items[0]?.playableLead === true,
    canLead: item => item.playableLead === true,
  });

  return result.items.map((item, index) => {
    const version = item.ranking?.version;
    if (!version) return item;
    return {
      ...item,
      ranking: {
        ...item.ranking!,
        version: `${version}+seen.${SEEN_DEMOTION_VERSION}`,
        ...(result.demoted.has(index) ? { seenDemoted: true } : {}),
      },
    };
  });
}

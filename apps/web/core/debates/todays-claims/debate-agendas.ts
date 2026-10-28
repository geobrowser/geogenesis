'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { Position } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { EntitiesOrderBy } from '~/core/gql/graphql';
import { useQueryEntities } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { type ClaimPickerEntity, useClaimEntitiesByIds } from '../claim-picker-page';
import { zonedDay } from '../debate-hours';

/**
 * GEO-3487's Debate agenda type: one Page per space per day, a data block per topic with that
 * topic's claims as its items. Not tagged Debate, so the lobby's list picker leaves it alone.
 */
export const DEBATE_AGENDA_TYPE_ID = '79e3757b2630492c9d3bd73a78d45893';

/** The agenda's day, written as midnight New York. One of the graph's several properties named "Date". */
export const DEBATE_AGENDA_DATE_PROPERTY_ID = '52665f3efb7d48d58b6babb21b0d36db';

/** Agenda days are New York days, the way the agendas are written and the ranking reads them. */
export const AGENDA_TIME_ZONE = 'America/New_York';

/** "Earlier this week": agendas from the six days before today. */
export const EARLIER_AGENDA_DAYS = 6;

/**
 * Agendas asked for, newest first. About five spaces publish one a day, so this is three weeks of
 * them, against the one week the picker reads.
 */
const AGENDA_PAGE_SIZE = 100;

/** Data blocks asked for in one page. A week of agendas carries well under this. */
const AGENDA_BLOCK_PAGE_SIZE = 500;

/** One data block of one space's newest agenda: a heading and its claims, in the agenda's order. */
export type DebateAgendaSection = {
  /** The block id, which a new day's agenda replaces, so a section's remembered state is the day's. */
  id: string;
  agendaId: string;
  spaceId: string;
  name: string;
  claimIds: string[];
  /** The agenda's own Date value, as written. When a debate starts counting as "since the listing". */
  listedAt: string;
};

/** A claim from an agenda before the space's newest, for "Earlier this week". */
export type DebateAgendaListing = {
  claimId: string;
  spaceId: string;
  agendaId: string;
  /** The agenda's day, `YYYY-MM-DD`. */
  listedOn: string;
  listedAt: string;
};

export type DebateAgendaSpace = {
  spaceId: string;
  /** The day of this space's newest agenda, `YYYY-MM-DD`. */
  listedOn: string;
  sections: DebateAgendaSection[];
};

export type DebateAgendas = {
  /** Every space with an agenda in the window, each with its newest day's sections, unordered. */
  spaces: DebateAgendaSpace[];
  /** Claims from older agendas this week that their space's newest one does not list, newest listing first. */
  earlier: DebateAgendaListing[];
  /** The newest agenda day across every space, or null when there are none. */
  newestDay: string | null;
  /**
   * Each listed claim's newest listing, the agenda Date it was listed under as written: where its
   * debates start counting.
   */
  listedAtByClaim: Map<string, string>;
};

type AgendaEntity = {
  id: string;
  spaces: string[];
  values: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }>;
  relations: Array<{
    isDeleted?: boolean;
    type: { id: string };
    toEntity: { id: string };
    position?: string;
    spaceId?: string | null;
  }>;
  createdAt?: string | number;
};

type BlockEntity = {
  id: string;
  name: string | null;
  relations: AgendaEntity['relations'];
};

/**
 * The calendar day an agenda's Date value names, as it was written: `2026-10-27T00:00:00-04:00` and
 * `2026-10-27T04:00:00Z` are both the 27th. Read the way gaia reads it (GEO-3488), so the picker and
 * the ranking agree on which agenda is a space's newest.
 */
export function agendaDayFromValue(value: string): string | null {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** One agenda as one space has it: the space's own Date and blocks. */
type SpaceAgenda = { agendaId: string; spaceId: string; day: string; listedAt: string; blockIds: string[] };

/**
 * Every (agenda, space) pair dated today or earlier, with that space's blocks in order. An agenda
 * can be written into more than one space, and each space has its own blocks for it, so the blocks
 * are read per space rather than off the entity as a whole.
 */
export function spaceAgendasOf(agendas: AgendaEntity[], today: string): SpaceAgenda[] {
  const out: SpaceAgenda[] = [];
  for (const agenda of agendas) {
    for (const spaceId of agenda.spaces) {
      const dateValue = agenda.values.find(
        value =>
          value.isDeleted !== true &&
          value.property.id === DEBATE_AGENDA_DATE_PROPERTY_ID &&
          normId(value.spaceId) === normId(spaceId)
      );
      const day = dateValue ? agendaDayFromValue(dateValue.value) : null;
      // A future-dated agenda waits for its day, as the ranking does.
      if (!dateValue || !day || day > today) continue;
      const blockIds = agenda.relations
        .filter(
          relation =>
            relation.isDeleted !== true &&
            relation.type.id === SystemIds.BLOCKS &&
            relation.spaceId != null &&
            normId(relation.spaceId) === normId(spaceId)
        )
        .slice()
        .sort(byPosition)
        .map(relation => relation.toEntity.id);
      out.push({ agendaId: agenda.id, spaceId, day, listedAt: dateValue.value, blockIds });
    }
  }
  return out;
}

/**
 * The picker's agendas: each space's newest day, and what the rest of the week listed that the
 * newest day does not.
 *
 * Two agendas a space dated the same day are both its newest, in the order the graph returned them
 * (newest written first). A claim listed twice this week shows once, at its newest listing.
 */
export function buildDebateAgendas(
  agendas: AgendaEntity[],
  blocks: BlockEntity[],
  claimIds: ReadonlySet<string>,
  today: string,
  /**
   * Whether a space's agendas count at all. Applied before anything else, so an agenda in a space
   * that does not count cannot move a claim's listing, take its place in Earlier this week, or
   * become the newest day.
   */
  keepSpace: (spaceId: string) => boolean = () => true
): DebateAgendas {
  const blocksById = new Map(blocks.map(block => [normId(block.id), block]));
  const oldest = oldestAgendaDay(today);
  const inWindow = spaceAgendasOf(agendas, today).filter(agenda => agenda.day >= oldest && keepSpace(agenda.spaceId));

  const claimsOf = (agenda: SpaceAgenda) =>
    agenda.blockIds.flatMap(blockId => {
      const block = blocksById.get(normId(blockId));
      if (!block) return [];
      const ids = block.relations
        .filter(
          relation =>
            relation.isDeleted !== true &&
            relation.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE &&
            (relation.spaceId == null || normId(relation.spaceId) === normId(agenda.spaceId))
        )
        .slice()
        .sort(byPosition)
        .map(relation => normId(relation.toEntity.id))
        // A collection holds whatever was dropped in it; only claims have sides to take.
        .filter(id => claimIds.has(id));
      return [{ block, claimIds: [...new Set(ids)] }];
    });

  const bySpace = new Map<string, SpaceAgenda[]>();
  for (const agenda of inWindow) {
    const key = normId(agenda.spaceId);
    bySpace.set(key, [...(bySpace.get(key) ?? []), agenda]);
  }

  const spaces: DebateAgendaSpace[] = [];
  const earlier: DebateAgendaListing[] = [];
  for (const spaceAgendas of bySpace.values()) {
    const newestDay = spaceAgendas.reduce((day, agenda) => (agenda.day > day ? agenda.day : day), '');
    const newest = spaceAgendas.filter(agenda => agenda.day === newestDay);
    const sections = newest.flatMap(agenda =>
      claimsOf(agenda)
        .filter(({ claimIds: ids }) => ids.length > 0)
        .map(({ block, claimIds: ids }) => ({
          id: block.id,
          agendaId: agenda.agendaId,
          spaceId: agenda.spaceId,
          name: block.name ?? 'Today’s claims',
          claimIds: ids,
          listedAt: agenda.listedAt,
        }))
    );
    if (sections.length > 0) spaces.push({ spaceId: newest[0]!.spaceId, listedOn: newestDay, sections });

    const listedToday = new Set(sections.flatMap(section => section.claimIds));
    for (const agenda of spaceAgendas) {
      if (agenda.day === newestDay) continue;
      for (const { claimIds: ids } of claimsOf(agenda)) {
        for (const claimId of ids) {
          if (listedToday.has(claimId)) continue;
          earlier.push({
            claimId,
            spaceId: agenda.spaceId,
            agendaId: agenda.agendaId,
            listedOn: agenda.day,
            listedAt: agenda.listedAt,
          });
        }
      }
    }
  }

  // Newest listing first, keeping each day's agenda order; then once per claim, at its newest.
  const seen = new Set<string>();
  const earlierOnce = earlier
    .map((listing, index) => ({ listing, index }))
    .sort((a, b) =>
      a.listing.listedOn === b.listing.listedOn ? a.index - b.index : a.listing.listedOn < b.listing.listedOn ? 1 : -1
    )
    .map(({ listing }) => listing)
    .filter(listing => {
      if (seen.has(listing.claimId)) return false;
      seen.add(listing.claimId);
      return true;
    });

  // A claim's newest listing: a space's newest day first, newest of those first, then the week's.
  const listedAtByClaim = new Map<string, string>();
  const listed = (claimId: string, listedAt: string) => {
    if (!listedAtByClaim.has(claimId)) listedAtByClaim.set(claimId, listedAt);
  };
  for (const space of [...spaces].sort((a, b) => (a.listedOn < b.listedOn ? 1 : -1))) {
    for (const section of space.sections) for (const claimId of section.claimIds) listed(claimId, section.listedAt);
  }
  for (const listing of earlierOnce) listed(listing.claimId, listing.listedAt);

  const newestDay = spaces.reduce<string | null>(
    (day, space) => (day === null || space.listedOn > day ? space.listedOn : day),
    null
  );

  return { spaces, earlier: earlierOnce, newestDay, listedAtByClaim };
}

/** The first day "Earlier this week" reaches back to. */
function oldestAgendaDay(today: string) {
  return zonedDay(new Date(`${today}T12:00:00Z`), 'UTC', -EARLIER_AGENDA_DAYS);
}

export const NO_AGENDAS: DebateAgendas = { spaces: [], earlier: [], newestDay: null, listedAtByClaim: new Map() };

/**
 * GEO-3489. Every space's newest Debate agenda, read from the graph, with the week's older listings.
 *
 * The one place the Today's claims surfaces read agendas from — the picker today, the side panel,
 * hub and lobby next (GEO-3490, GEO-3491) — so when GEO-3503's agendas query lands, only this
 * changes. Three hops by necessity, like `useRecommendedClaimSections`: the agendas, their blocks,
 * and the claims the blocks hold.
 */
export function useDebateAgendas(enabled = true): {
  /**
   * The agendas, counting only the spaces `keepSpace` keeps. A function rather than a value because
   * which spaces count is the caller's to decide — the picker needs each space's type, which it
   * looks up from `spaceIds`.
   */
  agendasIn: (keepSpace: (spaceId: string) => boolean) => DebateAgendas;
  /** Every space with an agenda this week, before `keepSpace`. */
  spaceIds: string[];
  /** Every claim any of those agendas lists, before `keepSpace`. */
  claimIds: string[];
  /** The listed claims, so callers don't fetch what this already resolved. */
  claimEntities: ClaimPickerEntity[];
  /** True until every hop has settled; empty agendas mean "none" only after. */
  isLoading: boolean;
  error: unknown;
} {
  // Taken once per mount. A picker left open past midnight keeps the agendas it opened on.
  const [today] = React.useState(() => zonedDay(new Date(), AGENDA_TIME_ZONE));

  const {
    entities: agendaEntities,
    isLoading: agendasLoading,
    error: agendasError,
  } = useQueryEntities({
    where: { types: [{ id: { equals: DEBATE_AGENDA_TYPE_ID } }] },
    first: AGENDA_PAGE_SIZE,
    orderBy: [EntitiesOrderBy.CreatedAtDesc],
    prefetchNextPage: false,
    enabled,
  });

  const oldest = oldestAgendaDay(today);
  const inWindow = React.useMemo(
    () => spaceAgendasOf(agendaEntities, today).filter(agenda => agenda.day >= oldest),
    [agendaEntities, oldest, today]
  );
  const blockIds = React.useMemo(() => [...new Set(inWindow.flatMap(agenda => agenda.blockIds))], [inWindow]);
  const spaceIds = React.useMemo(
    () => (enabled ? [...new Map(inWindow.map(agenda => [normId(agenda.spaceId), agenda.spaceId])).values()] : NO_IDS),
    [enabled, inWindow]
  );

  const {
    entities: blockEntities,
    isLoading: blocksLoading,
    error: blocksError,
  } = useQueryEntities({
    where: { id: { in: blockIds } },
    first: AGENDA_BLOCK_PAGE_SIZE,
    prefetchNextPage: false,
    enabled: enabled && blockIds.length > 0,
  });

  const itemIds = React.useMemo(() => {
    const blockIdSet = new Set(blockIds.map(normId));
    return [
      ...new Set(
        blockEntities
          .filter(block => blockIdSet.has(normId(block.id)))
          .flatMap(block =>
            block.relations
              .filter(
                relation => relation.isDeleted !== true && relation.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE
              )
              .map(relation => normId(relation.toEntity.id))
          )
      ),
    ];
  }, [blockEntities, blockIds]);

  const {
    entities: claimEntities,
    isLoading: claimsLoading,
    error: claimsError,
  } = useClaimEntitiesByIds(enabled ? itemIds : NO_IDS);

  const claimIds = React.useMemo(() => claimEntities.map(claim => normId(claim.id)), [claimEntities]);
  const agendasIn = React.useCallback(
    (keepSpace: (spaceId: string) => boolean) =>
      enabled ? buildDebateAgendas(agendaEntities, blockEntities, new Set(claimIds), today, keepSpace) : NO_AGENDAS,
    [agendaEntities, blockEntities, claimIds, enabled, today]
  );

  const isLoading =
    enabled && (agendasLoading || (blockIds.length > 0 && blocksLoading) || (itemIds.length > 0 && claimsLoading));

  return React.useMemo(
    () => ({
      agendasIn,
      spaceIds,
      claimIds: enabled ? claimIds : NO_IDS,
      claimEntities,
      isLoading,
      error: agendasError ?? blocksError ?? claimsError ?? null,
    }),
    [agendasError, agendasIn, blocksError, claimEntities, claimIds, claimsError, enabled, isLoading, spaceIds]
  );
}

const NO_IDS: string[] = [];

/** Blocks and collection items both carry a fractional index, ordered the way `sortRelations` orders them. */
function byPosition(a: { position?: string }, z: { position?: string }) {
  return Position.compare(a.position ?? null, z.position ?? null);
}

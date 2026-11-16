import type { ActionScope } from '~/core/action-context';
import { normId } from '~/core/utils/norm-id';

/** What a Today's claims card adds to its list attribution (GEO-3495). */
export type TodaysCardScope = Pick<
  ActionScope,
  'agenda_id' | 'agenda_date' | 'list_section_id' | 'debated_since_listing'
> & { agenda_id: string };

/**
 * GEO-3495's attribution for a Today's claims card, on whichever surface lists it (the picker here;
 * the hub and lobby next): the agenda it was listed on and that agenda's day (`YYYY-MM-DD`), its section
 * (an agenda's data block; Earlier this week has none), and its debates since the listing when
 * geo-chat could count them.
 */
export function todaysCardScope(
  agendaId: string,
  listedOn: string,
  debatesSinceListing: number | undefined,
  sectionId?: string
): TodaysCardScope {
  return {
    agenda_id: agendaId,
    agenda_date: listedOn,
    ...(sectionId ? { list_section_id: sectionId } : {}),
    ...(debatesSinceListing === undefined ? {} : { debated_since_listing: debatesSinceListing }),
  };
}

/**
 * GEO-3733, GEO-3775. Each agenda claim's attribution on a list that is not Today's claims, where
 * agenda-only every card is an agenda claim: without it their picks and impressions read as
 * off-agenda in the warehouse's `on_agenda` measures.
 *
 * `seed` first (the picker's own Today's cards, so a claim on two agendas is credited to the same
 * one on every tab), then each claim's first listing: current sections ahead of Earlier this week.
 * `debatesOf` adds the debates since the listing where the caller has them counted.
 */
export function agendaScopeIndex(
  agendas: {
    spaces: ReadonlyArray<{
      sections: ReadonlyArray<{ id: string; agendaId: string; listedOn: string; claimIds: readonly string[] }>;
    }>;
    earlier: ReadonlyArray<{ claimId: string; agendaId: string; listedOn: string }>;
  },
  debatesOf: (claimId: string) => number | undefined = () => undefined,
  seed: Iterable<readonly [string, TodaysCardScope]> = []
): Map<string, TodaysCardScope> {
  const byClaim = new Map<string, TodaysCardScope>();
  for (const [claimId, scope] of seed) {
    const id = normId(claimId);
    if (!byClaim.has(id)) byClaim.set(id, scope);
  }
  for (const space of agendas.spaces)
    for (const section of space.sections)
      for (const claimId of section.claimIds) {
        const id = normId(claimId);
        if (!byClaim.has(id))
          byClaim.set(id, todaysCardScope(section.agendaId, section.listedOn, debatesOf(id), section.id));
      }
  for (const listing of agendas.earlier) {
    const id = normId(listing.claimId);
    if (!byClaim.has(id)) byClaim.set(id, todaysCardScope(listing.agendaId, listing.listedOn, debatesOf(id)));
  }
  return byClaim;
}

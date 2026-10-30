import type { ActionScope } from '~/core/action-context';

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

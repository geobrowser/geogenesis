import { uuidToHex } from '~/core/id/normalize';

/**
 * GEO-3491. The id a lobby stores for its "Today's claims" list, in both `entity_id` and `space_id`.
 *
 * geo-chat keeps a lobby list as a page id and a space id and only checks that each is 32 hex, so
 * Today's claims is stored like any page, under an id no entity has. The tab reads the newest agendas
 * each time it opens rather than a page, so a lobby scheduled for Thursday shows Thursday's.
 */
export const TODAYS_CLAIMS_LIST_ID = '698fd9152d904087a33634278640408e';

export const TODAYS_CLAIMS_LIST_NAME = 'Today’s claims';

/** Whether a lobby list is Today's claims rather than a page. Any id spelling. */
export function isTodaysClaimsList(entityId: string): boolean {
  return uuidToHex(entityId) === TODAYS_CLAIMS_LIST_ID;
}

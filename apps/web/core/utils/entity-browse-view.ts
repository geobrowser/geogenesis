import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';
import { ID } from '~/core/id';

export type EntityBrowseView = 'claim' | 'topic' | 'person' | null;

/**
 * The custom read surface an entity's types put it in line for.
 *
 * This precedence is shared by the client body and the server route/layout. Keeping it here avoids
 * a mixed-type entity being classified as a Claim in one layer and wrapped in a Person profile in
 * another. Claim and Topic are narrower record types, so both take precedence over Person.
 */
export function entityBrowseViewFromTypes(types: readonly { id: string }[]): EntityBrowseView {
  if (types.some(type => ID.equals(type.id, CLAIM_TYPE_ID))) return 'claim';
  if (types.some(type => ID.equals(type.id, TOPIC_TYPE_ID))) return 'topic';
  if (types.some(type => ID.equals(type.id, SystemIds.PERSON_TYPE))) return 'person';

  return null;
}

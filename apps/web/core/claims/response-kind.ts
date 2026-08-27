import { uuidToHex } from '~/core/id/normalize';

import { getChecked } from '~/design-system/checkbox';

import { CLAIM_IS_FACTUAL_PROPERTY_ID } from './ontology';

/** The subset of an entity this reads. A full `Entity` satisfies it structurally. */
type ClaimValues = {
  values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }>;
};

/**
 * Which vocabulary labels a claim's two sides: Verify/Dispute for a factual claim, Agree/Disagree
 * otherwise.
 *
 * Read per space on purpose. "Is factual" is a value like any other, so two spaces can disagree
 * about the same claim, and the side labels have to match the space the response is published
 * against.
 */
export function claimResponseKind(claim: ClaimValues, spaceId: string): 'stance' | 'veracity' {
  const isFactual = claim.values?.find(
    value =>
      value.isDeleted !== true &&
      uuidToHex(value.spaceId) === uuidToHex(spaceId) &&
      uuidToHex(value.property.id) === uuidToHex(CLAIM_IS_FACTUAL_PROPERTY_ID)
  )?.value;

  return getChecked(isFactual) === true ? 'veracity' : 'stance';
}

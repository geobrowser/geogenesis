import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { EntityRecordPage, type EntityRecordPageProps, type EntityRecordSeed } from './entity-record-page';

export type ClaimRecordPageProps = EntityRecordPageProps;

export function ClaimRecordPage(props: ClaimRecordPageProps & { seed?: EntityRecordSeed }) {
  return <EntityRecordPage {...props} requiredTypeId={CLAIM_TYPE_ID} />;
}

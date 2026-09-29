import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { EntityRecordPage, type EntityRecordPageProps } from './entity-record-page';

export type ClaimRecordPageProps = EntityRecordPageProps;

export function ClaimRecordPage(props: ClaimRecordPageProps) {
  return <EntityRecordPage {...props} requiredTypeId={CLAIM_TYPE_ID} />;
}

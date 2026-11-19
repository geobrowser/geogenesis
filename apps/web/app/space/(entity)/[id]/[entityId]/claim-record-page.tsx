import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import type { ClaimRecordSubPath } from './claim-home-space-redirect';
import { EntityRecordPage, type EntityRecordPageProps, type EntityRecordSeed } from './entity-record-page';

export type ClaimRecordPageProps = EntityRecordPageProps;

export function ClaimRecordPage(
  props: ClaimRecordPageProps & { seed?: EntityRecordSeed; subPath: ClaimRecordSubPath }
) {
  const { subPath, ...rest } = props;
  return <EntityRecordPage {...rest} requiredTypeId={CLAIM_TYPE_ID} claimSubPath={subPath} />;
}

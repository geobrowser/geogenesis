import { claimCanonicalMetadata } from '../claim-canonical';
import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';
import { claimRelatedClaimsSeed } from '../claim-record-seed';

export function generateMetadata(props: ClaimRecordPageProps) {
  return claimCanonicalMetadata({ params: props.params, subPath: 'claims' });
}

export default function ClaimClaimsPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} seed={claimRelatedClaimsSeed} />;
}

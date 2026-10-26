import { claimRelatedClaimsSeed } from '../claim-record-seed';
import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';

export default function ClaimClaimsPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} seed={claimRelatedClaimsSeed} />;
}

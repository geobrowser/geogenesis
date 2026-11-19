import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';
import { claimRelatedClaimsSeed } from '../claim-record-seed';

export default function ClaimClaimsPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} subPath="claims" seed={claimRelatedClaimsSeed} />;
}

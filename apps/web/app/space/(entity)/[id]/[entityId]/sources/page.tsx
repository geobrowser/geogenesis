import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';
import { claimSourcesSeed } from '../claim-record-seed';

export default function ClaimSourcesPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} seed={claimSourcesSeed} />;
}

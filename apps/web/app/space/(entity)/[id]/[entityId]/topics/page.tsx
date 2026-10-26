import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';
import { claimTopicsSeed } from '../claim-record-seed';

export default function ClaimTopicsPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} seed={claimTopicsSeed} />;
}

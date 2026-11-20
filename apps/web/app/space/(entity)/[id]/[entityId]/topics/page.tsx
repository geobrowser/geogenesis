import { claimCanonicalMetadata } from '../claim-canonical';
import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';
import { claimTopicsSeed } from '../claim-record-seed';

export function generateMetadata(props: ClaimRecordPageProps) {
  return claimCanonicalMetadata({ params: props.params, subPath: 'topics' });
}

export default function ClaimTopicsPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} seed={claimTopicsSeed} />;
}

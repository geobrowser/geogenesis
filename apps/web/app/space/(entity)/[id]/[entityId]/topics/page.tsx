import { claimCanonicalMetadata } from '../claim-home-space-redirect';
import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';
import { claimTopicsSeed } from '../claim-record-seed';

export function generateMetadata(props: ClaimRecordPageProps) {
  return claimCanonicalMetadata({ params: props.params, subPath: 'topics' });
}

export default function ClaimTopicsPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} subPath="topics" seed={claimTopicsSeed} />;
}

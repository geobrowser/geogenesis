import { claimCanonicalMetadata } from '../claim-canonical';
import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';
import { claimSourcesSeed } from '../claim-record-seed';

export function generateMetadata(props: ClaimRecordPageProps) {
  return claimCanonicalMetadata({ params: props.params, subPath: 'sources' });
}

export default function ClaimSourcesPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} seed={claimSourcesSeed} />;
}

import { claimCanonicalMetadata } from '../claim-home-space-redirect';
import { ClaimRecordPage, type ClaimRecordPageProps } from '../claim-record-page';

export function generateMetadata(props: ClaimRecordPageProps) {
  return claimCanonicalMetadata({ params: props.params, subPath: 'debates' });
}

export default function ClaimDebatesPage(props: ClaimRecordPageProps) {
  return <ClaimRecordPage {...props} subPath="debates" />;
}

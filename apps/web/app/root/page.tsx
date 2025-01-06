import { SYSTEM_IDS } from '@geogenesis/sdk';

import Page from '../space/[id]/page';

export default function RootPage() {
  return <Page params={{ id: SYSTEM_IDS.ROOT_SPACE_ID }} />;
}

import { SYSTEM_IDS } from '@graphprotocol/grc-20';

import Page from '../space/[id]/page';

export default function RootPage() {
  const params = new Promise<{ id: string }>(resolve => resolve({ id: SYSTEM_IDS.ROOT_SPACE_ID }));
  return <Page params={params} />;
}

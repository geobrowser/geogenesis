import { SystemIds } from '@graphprotocol/grc-20';

import Page from '../space/[id]/page';

export default function RootPage() {
  const params = new Promise<{ id: string }>(resolve => resolve({ id: SystemIds.ROOT_SPACE_ID }));
  return <Page params={params} />;
}

import { ROOT_SPACE_ID } from '~/core/constants';

import Page from '../space/[id]/page';

export default function RootPage() {
  const params = new Promise<{ id: string }>(resolve => resolve({ id: ROOT_SPACE_ID }));
  return <Page params={params} />;
}

import { ROOT_SPACE } from '~/core/constants';

import Page from '../space/[id]/page';

export default function RootPage() {
  const params = new Promise<{ id: string }>(resolve => resolve({ id: ROOT_SPACE }));
  return <Page params={params} />;
}

import { ClientOnly } from '~/design-system/client-only';

import { CreateDao } from './create-dao';

export const revalidate = 0;

export default async function Page() {
  return (
    <div className="flex flex-row gap-4">
      <ClientOnly>
        <CreateDao type="governance" />
      </ClientOnly>
    </div>
  );
}

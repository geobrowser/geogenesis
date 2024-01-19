import { ClientOnly } from '~/design-system/client-only';

import CreateDao from './create-dao';

function Page() {
  return (
    <div className="flex flex-row">
      <ClientOnly>
        <CreateDao />
      </ClientOnly>
    </div>
  );
}

export default Page;

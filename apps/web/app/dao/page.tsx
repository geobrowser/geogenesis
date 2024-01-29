import { ClientOnly } from '~/design-system/client-only';

import CreateDao from './create-dao';
import { CreateProposal } from './create-proposal';

function Page() {
  return (
    <div className="flex flex-row">
      <ClientOnly>
        <CreateDao />
        <CreateProposal />
      </ClientOnly>
    </div>
  );
}

export default Page;

import { ClientOnly } from '~/design-system/client-only';

import { Tools } from './component';

export const dynamic = 'force-dynamic';

export default function ToolsPage() {
  return (
    <ClientOnly>
      <Tools />
    </ClientOnly>
  );
}

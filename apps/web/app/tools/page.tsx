import { ClientOnly } from '~/design-system/client-only';

import { Tools } from './component';

export default function ToolsPage() {
  return (
    <ClientOnly>
      <Tools />
    </ClientOnly>
  );
}

import { ClientOnly } from '~/design-system/client-only';

import { Component } from './component';

export default function DevPage() {
  return (
    <ClientOnly>
      <Component />
    </ClientOnly>
  );
}

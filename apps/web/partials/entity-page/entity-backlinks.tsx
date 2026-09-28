'use client';

import * as React from 'react';

import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';

import { BacklinksClientContainer } from '~/partials/entity-page/backlinks-client-container';

/**
 * What links here, for a client surface.
 *
 * **The client container, not the server one**, and the distinction is not
 * cosmetic. `BacklinksServerContainer` is an async component; a client component
 * does not get Server Component treatment for it, so React re-invokes the
 * function on every render — firing its two requests again, suspending,
 * resolving, rendering, and invoking it again. A `Suspense` around it hid that
 * completely: the backlinks looked fine while a single entity page load sent
 * `EntityBacklinksPage` 82 times and `Spaces` 64 times with identical variables
 * (GEO-2666).
 *
 * The server container is still right for the three routes that render it from
 * an actual server component; it just cannot be reached from here.
 *
 * Its own module so the two client surfaces that need it — the generic entity
 * body and the profile's Overview — share one copy. The profile could not import
 * it from `entity-page-body` without closing an import cycle back through the
 * view that file renders.
 */
export function EntityBacklinks({ entityId }: { entityId: string }) {
  return (
    <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
      <BacklinksClientContainer entityId={entityId} />
    </TrackedErrorBoundary>
  );
}

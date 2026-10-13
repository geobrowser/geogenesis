'use client';

import * as React from 'react';

import type { DebateRequestSurface as Surface } from '~/core/action-context';
import { ActionContextProvider } from '~/core/action-context-provider';

/**
 * Names the surface debate requests are sent from, for everything rendered inside (GEO-3244).
 *
 * Set by the surface itself at its root rather than inferred from the page later: the claim page
 * and the side panel showing the same claim are different surfaces, and so are the debates panel
 * and the full-screen debates page showing the same tab. Inner surfaces win, so a profile opened
 * in the side panel still sends from `profile`.
 *
 * `origin` is where the flow began when that was somewhere else, as on a calendar opened from a
 * claim; `opportunityId` is the button that began it, so the send is joined to that offer.
 */
export function DebateRequestSurface({
  surface,
  origin,
  opportunityId,
  children,
}: {
  surface: Surface;
  origin?: Surface | null;
  opportunityId?: string | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({
      request_surface: surface,
      ...(origin ? { origin_surface: origin } : {}),
      ...(opportunityId ? { opportunity_id: opportunityId } : {}),
    }),
    [opportunityId, origin, surface]
  );
  return <ActionContextProvider value={value}>{children}</ActionContextProvider>;
}

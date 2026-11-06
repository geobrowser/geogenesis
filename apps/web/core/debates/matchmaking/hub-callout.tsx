import * as React from 'react';

import { Text } from '~/design-system/text';

/**
 * A callout's colours, one per kind, without its shape: lavender for a prompt (the schedule banner,
 * Today's claims), and white with a border for a lobby still to open (GEO-3586), which is light rather
 * than the live card's black because black means "happening now". The panel's callout stack draws
 * each card's edge in the same colours.
 */
export const HUB_CALLOUT_SURFACE_CLASS_NAME = {
  tint: 'bg-purple-tint',
  light: 'border border-grey-02 bg-white',
} as const;

const HUB_CALLOUT_SHAPE_CLASS_NAME = 'rounded-lg p-4';

/**
 * The lavender callout: the debate schedule banner on the calendar (GEO-2936) and the Today's claims
 * callout above the debates side panel's tabs (GEO-3498). Its surface, without the spacing, which
 * each surface sets for its own gutters.
 */
export const HUB_CALLOUT_CLASS_NAME = `${HUB_CALLOUT_SHAPE_CLASS_NAME} ${HUB_CALLOUT_SURFACE_CLASS_NAME.tint}`;

/** The light callout: an upcoming lobby in the panel's callout stack (GEO-3586). */
export const HUB_LIGHT_CALLOUT_CLASS_NAME = `${HUB_CALLOUT_SHAPE_CLASS_NAME} ${HUB_CALLOUT_SURFACE_CLASS_NAME.light}`;

/**
 * A callout's title row: the title, one level under the surface's own heading (the panel's h2, a
 * page's h1), with the callout's control at the far end.
 */
export function HubCalloutTitle({
  as,
  title,
  children,
}: {
  as: 'h2' | 'h3';
  title: React.ReactNode;
  /** The trailing control: an action pill, or dismiss. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Text as={as} variant="smallTitle">
        {title}
      </Text>
      {children}
    </div>
  );
}

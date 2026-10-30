import * as React from 'react';

import { Text } from '~/design-system/text';

/**
 * The lavender callout: the debate schedule banner on the calendar (GEO-2936) and the Today's claims
 * callout above the debates side panel's tabs (GEO-3498). Its surface, without the spacing, which
 * each surface sets for its own gutters.
 */
export const HUB_CALLOUT_CLASS_NAME = 'rounded-lg bg-purple-tint p-4';

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

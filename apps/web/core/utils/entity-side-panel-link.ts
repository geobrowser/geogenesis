import type * as React from 'react';

/**
 * Let tracking run after the room's capture handler chooses the destination. A callback that
 * also navigates must honor defaultPrevented. Stop afterward so parent card handlers cannot
 * navigate again. Outside the room, this preserves the link's ordinary click behavior.
 */
export function observePanelNavigation(onClick?: React.MouseEventHandler<HTMLAnchorElement>) {
  return {
    'data-entity-side-panel-navigation': 'observe' as const,
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) event.stopPropagation();
    },
  };
}

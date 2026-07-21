'use client';

import * as React from 'react';

import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';

import { SidePanel } from '~/design-system/icons/side-panel';

const sidePanelOpenerClassName =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-none bg-transparent p-0 text-grey-03 transition duration-300 ease-in-out hover:text-text focus:outline-hidden';

export function DataBlockOpenSidePanelButton({
  entityId,
  entitySpaceId,
  openedWithMainViewEditing,
  ariaLabel = 'Open entity in side panel',
}: {
  entityId: string;
  entitySpaceId: string;
  openedWithMainViewEditing: boolean;
  ariaLabel?: string;
}) {
  const { openSidePanel } = useEntitySidePanel();

  const onClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openSidePanel(entityId, entitySpaceId, openedWithMainViewEditing);
    },
    [entityId, entitySpaceId, openSidePanel, openedWithMainViewEditing]
  );

  return (
    <button
      type="button"
      data-entity-side-panel-opener
      className={sidePanelOpenerClassName}
      aria-label={ariaLabel}
      onMouseDown={e => {
        e.stopPropagation();
      }}
      onClick={onClick}
    >
      <SidePanel />
    </button>
  );
}

'use client';

import * as React from 'react';

import { Ellipsis } from '~/design-system/icons/ellipsis';
import { Menu } from '~/design-system/menu';

import { hubAnalyticsAttributes } from './hub-analytics';

export type RequestOverflowAction = {
  label: string;
  /** Stable action name; unlike `label`, this must not contain a person's name. */
  analyticsLabel: string;
  onClick: () => void;
  destructive?: boolean;
};

/**
 * The "…" affordance on request cards and the request popup. Blocking and dropping a claim's debate
 * intent live here so the primary actions stay Accept / Dismiss.
 */
export function RequestOverflowMenu({ actions }: { actions: RequestOverflowAction[] }) {
  const [open, setOpen] = React.useState(false);

  if (actions.length === 0) return null;

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      className="max-w-[240px]"
      trigger={
        <button
          type="button"
          aria-label="More options"
          {...hubAnalyticsAttributes('Request options', 'open_debate_request_options')}
          className="flex h-7 w-7 items-center justify-center rounded-full text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
        >
          <Ellipsis />
        </button>
      }
    >
      <>
        {actions.map(action => (
          <button
            key={action.label}
            type="button"
            {...hubAnalyticsAttributes(action.analyticsLabel, 'manage_debate_request')}
            onClick={() => {
              setOpen(false);
              action.onClick();
            }}
            className={`flex w-full cursor-pointer items-center bg-white px-3 py-2.5 text-left text-button hover:bg-bg ${
              action.destructive ? 'text-red-01' : 'text-text'
            }`}
          >
            {action.label}
          </button>
        ))}
      </>
    </Menu>
  );
}

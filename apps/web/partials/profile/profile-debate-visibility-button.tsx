'use client';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Eye } from '~/design-system/icons/eye';
import { EyeHide } from '~/design-system/icons/eye-hide';

/** One-click owner control shown in a debate card's metadata row. */
export function ProfileDebateVisibilityButton({
  hidden,
  pending,
  onClick,
}: {
  hidden: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const label = hidden ? 'Unhide from profile' : 'Hide from profile';

  return (
    <SquareButton
      icon={hidden ? <Eye /> : <EyeHide />}
      disabled={pending}
      aria-label={pending ? `${label} (saving)` : label}
      title={label}
      className="ml-auto border-none bg-transparent text-grey-04 shadow-none hover:bg-bg"
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    />
  );
}

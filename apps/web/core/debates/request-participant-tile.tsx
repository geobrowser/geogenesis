import * as React from 'react';

import cx from 'classnames';

import { Avatar } from '~/design-system/avatar';

import { DebateTileChip, tileChipSurface } from './debate-video-tile';

/** A participant in the accepted-request preview, with controls over the local picture. */
export function RequestParticipantTile({
  label,
  avatarCid,
  avatarValue,
  local = false,
  controls,
  children,
}: {
  label: string;
  avatarCid?: string | null;
  avatarValue?: string | null;
  local?: boolean;
  controls?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cx(
        'relative aspect-[4/3] min-h-36 min-w-0 overflow-hidden rounded-md',
        local ? 'bg-grey-05' : 'border border-grey-02 bg-white'
      )}
    >
      {children ?? (
        <div className="absolute inset-0 grid place-items-center">
          <span className={cx('size-14 overflow-hidden rounded-full', local && '-translate-y-1')}>
            <Avatar avatarUrl={avatarCid} value={avatarValue ?? undefined} alt="" size={56} />
          </span>
        </div>
      )}
      <DebateTileChip className={cx(tileChipSurface, 'absolute top-1.5 left-1.5 max-w-[calc(100%-12px)] text-text')}>
        <span className="truncate">{label}</span>
      </DebateTileChip>
      {controls && <div className="absolute inset-x-2 bottom-2 flex justify-center">{controls}</div>}
    </section>
  );
}

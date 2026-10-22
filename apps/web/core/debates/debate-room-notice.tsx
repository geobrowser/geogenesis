'use client';

import * as React from 'react';

import cx from 'classnames';

import { Button } from '~/design-system/button';

import { ROOM_ENTER_CLASS, ROOM_GLASS_CLASS, ROOM_UI_FONT } from './debate-room-stamps';

/** Connection and save recovery stay readable on the room's white surface as well as video. */
export function DebateRoomNotice({
  children,
  error = false,
  actions,
}: {
  children: React.ReactNode;
  error?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      data-room-notice={error ? 'error' : 'connection'}
      className={cx(
        ROOM_GLASS_CLASS,
        ROOM_ENTER_CLASS,
        'pointer-events-auto mt-3 flex w-full max-w-[430px] flex-wrap items-center justify-between gap-3 rounded-[16px] px-4 py-3 text-[14px] leading-tight font-medium backdrop-blur-[14px]',
        error && 'ring-1 ring-[#FF8A73]/60'
      )}
      style={ROOM_UI_FONT}
    >
      <p className={cx('min-w-0 flex-1 break-words', error && 'text-[#FFD1C7]')}>{children}</p>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function DebateRoomNoticeAction({
  appearance = 'glass',
  className,
  ...props
}: React.ComponentPropsWithoutRef<'button'> & { appearance?: 'glass' | 'default' }) {
  if (appearance === 'default') return <Button {...props} type="button" variant="tertiary" className={className} />;
  return (
    <button
      {...props}
      type="button"
      className={cx(
        'rounded-full bg-white px-3 py-2 text-[14px] leading-none font-medium text-[#111] transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-50',
        className
      )}
    />
  );
}

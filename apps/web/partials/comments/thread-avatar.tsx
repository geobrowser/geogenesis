'use client';

import * as React from 'react';

import cx from 'classnames';

import { Avatar } from '~/design-system/avatar';

/**
 * A face in a thread, at the size its row asks for.
 *
 * `Avatar` fills its container whenever it has a real `avatarUrl` to draw — `size` only sizes the
 * generated fallback — so every call site has to supply a frame with a definite width and height.
 * The repo does that inline in dozens of places, and this PR got it wrong twice in the same row:
 * once by omitting the frame, and once by wrapping the frame in a link, which left the frame
 * `display: inline` and had a 987px face render in a 32px row.
 *
 * Both failures came from the frame and the element around it being separate things. Here they are
 * one thing: pass `href` and the frame *is* the link, so there is nothing to nest and nothing to
 * blockify.
 */
export function ThreadAvatar({
  avatarUrl,
  value,
  sizePx,
  href,
  label,
  onClick,
  className,
}: {
  avatarUrl?: string | null;
  /** Seed for the generated fallback — an address or a space id, whatever the row has. */
  value?: string | null;
  sizePx: number;
  /** Renders an anchor rather than a span. Omit where there is no person to open. */
  href?: string;
  /**
   * Who this face belongs to, for the link's accessible name.
   *
   * A face is the one kind of link with nothing readable inside it: the image carries empty `alt`
   * because the name is right beside it, and the generated fallback is an unlabelled SVG. So a linked
   * avatar announced as nothing at all, and there is no way to tell from the keyboard where it goes.
   * Required whenever `href` is — the name is always to hand at these call sites, because the row is
   * already printing it.
   */
  label?: string;
  onClick?: (event: React.MouseEvent) => void;
  className?: string;
}) {
  // `shrink-0` because these sit in flex rows that would otherwise squeeze the frame narrower than
  // its height and turn the circle into an ellipse.
  const frameClassName = cx('relative shrink-0 overflow-hidden rounded-full', className);
  const frameStyle = { width: sizePx, height: sizePx };
  const face = <Avatar avatarUrl={avatarUrl ?? null} value={value ?? undefined} size={sizePx} />;

  if (!href) {
    return (
      <span className={frameClassName} style={frameStyle}>
        {face}
      </span>
    );
  }

  return (
    <a href={href} aria-label={label} onClick={onClick} className={frameClassName} style={frameStyle}>
      {face}
    </a>
  );
}

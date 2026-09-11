import * as React from 'react';

import cx from 'classnames';

type Props = {
  /**
   * The surface the dot sits on, as a Tailwind *border* colour.
   *
   * The ring is not decoration: the dot sits on the edge of a face, so without a band of the
   * background behind it the green runs straight into whatever the avatar happens to show there.
   * Figma draws it as a 2px stroke in the surface colour, which is what this is — and why the
   * caller has to say what it is standing on rather than this guessing white.
   */
  ringClassName?: string;
  className?: string;
};

/**
 * The green "online now" dot on a face.
 *
 * `bg-green` is the design's `#2ACE9D` exactly, already a token here. Sized 8px overall — a 4px
 * dot inside a 2px ring — which is what the Figma card draws at its 16px avatars and holds at the
 * 20px ones these stacks use.
 *
 * Deliberately not part of `Avatar`: it says the person is *present*, which is a fact about a live
 * session rather than about the picture. Only the stacks built from presence pass it, so an avatar
 * cannot pick up a green dot by being rendered somewhere that never knew whether they were online.
 */
export function OnlineDot({ ringClassName = 'border-white', className }: Props) {
  return <span aria-hidden className={cx('block size-1 rounded-full border-2 bg-green', ringClassName, className)} />;
}

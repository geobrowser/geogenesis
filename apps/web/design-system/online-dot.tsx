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
 * `bg-green` is the design's `#2ACE9D` exactly, already a token here. 8px overall — 4px of green
 * in a 2px ring — which is Figma's `r=3` circle under an opaque `stroke-width=2`: the stroke
 * straddles the radius, so it eats the outer third of the fill and the green reads 4px, not 6px.
 * One size: the 12px faces that briefly wanted a smaller one are 16px again.
 *
 * `box-content` is load-bearing and its absence is silent. Tailwind's preflight makes everything
 * `border-box`, so a 4px box with a 2px border on each side has a *zero-width* content box: the
 * ring paints and the green has no area left to paint in. The dot then renders as a 4px disc in
 * whatever colour the surface behind it already is — invisible, on every avatar, with no error.
 * The avatar wrapper these sit on top of carries `box-content` for the same reason.
 *
 * Deliberately not part of `Avatar`: it says the person is *present*, which is a fact about a live
 * session rather than about the picture. Only the stacks built from presence pass it, so an avatar
 * cannot pick up a green dot by being rendered somewhere that never knew whether they were online.
 */
export function OnlineDot({ ringClassName = 'border-white', className }: Props) {
  return (
    <span
      aria-hidden
      className={cx('box-content block size-1 rounded-full border-2 bg-green', ringClassName, className)}
    />
  );
}

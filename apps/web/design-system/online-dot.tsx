import * as React from 'react';

import cx from 'classnames';

type Props = {
  /**
   * The diameter of the face this sits on, in px. The dot is drawn as a fraction of it.
   *
   * Defaults to 16, the claim pills' face — which is where this geometry came from, and where it
   * was the only size that existed.
   */
  faceSize?: number;
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
 * `bg-green` is the design's `#2ACE9D` exactly, already a token here.
 *
 * ## Scaled to the face, not fixed
 *
 * On a 16px face the dot is 4px of green in a 2px ring — 8px overall — which is Figma's `r=3`
 * circle under an opaque `stroke-width=2`: the stroke straddles the radius, so it eats the outer
 * third of the fill and the green reads 4px, not 6px.
 *
 * Those are the proportions, not the measurements: green is a quarter of the face and the ring half
 * the green. Hard-coding the 16px numbers left the 32px faces in the People tab wearing a dot built
 * for a face half their size, which read as a speck rather than a badge. One definition here rather
 * than a magic number at each call site, because the two had already drifted.
 *
 * Placement comes with it. The dot's green body sits on the face's own top-left corner and its ring
 * bleeds outside, so the avatar reads as notched rather than badged — which means the element
 * starts one ring-width up and left of that corner. Callers supply a `relative` wrapper the size of
 * the face; they do not do this arithmetic.
 *
 * ## `box-content` is load-bearing and its absence is silent
 *
 * Tailwind's preflight makes everything `border-box`, so a 4px box with a 2px border on each side
 * has a *zero-width* content box: the ring paints and the green has no area left to paint in. The
 * dot then renders as a 4px disc in whatever colour the surface behind it already is — invisible,
 * on every avatar, with no error. The avatar wrapper these sit on carries `box-content` too.
 *
 * ## Deliberately not part of `Avatar`
 *
 * It says the person is *present*, which is a fact about a live session rather than about the
 * picture. Only the stacks built from presence pass it, so an avatar cannot pick up a green dot by
 * being rendered somewhere that never knew whether they were online.
 */
export function OnlineDot({ faceSize = 16, ringClassName = 'border-white', className }: Props) {
  const green = faceSize / 4;
  const ring = green / 2;

  return (
    <span
      aria-hidden
      // Inline rather than Tailwind sizes: these are derived from `faceSize`, and a computed class
      // name is one the compiler never sees, so it would ship without the rule that sizes it.
      style={{
        width: green,
        height: green,
        borderWidth: ring,
        transform: `translate(${-ring}px, ${-ring}px)`,
      }}
      className={cx(
        'box-content absolute top-0 left-0 block rounded-full border-solid bg-green',
        ringClassName,
        className
      )}
    />
  );
}

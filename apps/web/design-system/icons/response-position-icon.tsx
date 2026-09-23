import * as React from 'react';

import type { ResponseKind } from '~/core/responses/entity-response';

import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';
import { VoteArrow } from '~/design-system/icons/vote-arrow';

type Props = {
  responseKind: ResponseKind;
  /** The side this glyph stands for: `true` is the positive one (Upvote / Agree / Verify). */
  position: boolean;
  /** Whether the viewer holds this side, which fills the glyph. */
  selected?: boolean;
};

/**
 * The glyph each response kind draws, keyed by the kind itself.
 *
 * A `Record<ResponseKind, …>` rather than a chain of `if`s with the last kind as the fallthrough:
 * adding a kind to `ResponseKind` without giving it a glyph is then a compile error here, instead
 * of silently drawing whatever the fallthrough happened to be. This component exists because three
 * copies of this mapping drifted apart, so the mapping that replaced them should not be able to
 * fall out of step with the type it is keyed on.
 *
 * `ENTITY_RESPONSE_COPY` is a `Record<ResponseKind, …>` for the same reason, and this is the same
 * vocabulary — the glyphs to its words.
 */
const RESPONSE_POSITION_GLYPH: Record<ResponseKind, (props: Required<Omit<Props, 'responseKind'>>) => React.ReactNode> =
  {
    stance: ({ position, selected }) => (position ? <ThumbUp filled={selected} /> : <ThumbDown filled={selected} />),
    curation: ({ position, selected }) => <VoteArrow direction={position ? 'up' : 'down'} filled={selected} />,
  };

/**
 * The glyph for one side of a response: an arrow for curation, a thumb for a claim.
 *
 * There used to be a third, a chevron, for a claim carrying the "Is factual" flag — those were
 * verified or disputed rather than agreed with. Claims are all answered the same way now, so the
 * chevron has nothing left to mean here and both claim sides are thumbs.
 *
 * `selected` fills the glyph, so the side you hold reads as taken even in a screenshot.
 *
 * No `color` on either: each takes `currentColor` from the button it sits in. Pinning a colour here
 * would let one glyph answer for its own shade while its neighbour reads the control's, which is
 * how the spellings of this mapping drifted apart when there were three of them.
 */
export function ResponsePositionIcon({ responseKind, position, selected = false }: Props) {
  // `?? stance` guards a value that is not a `ResponseKind` at all, which the types say cannot
  // happen and the wire disagrees. geo-chat still labels claims minted before the vocabularies
  // merged `"veracity"`, and that string reaches these controls typed as the narrowed kind it no
  // longer matches — so the lookup misses, and calling the result throws during render. A blank
  // debate ticker is a far worse answer than a thumb.
  const glyph = RESPONSE_POSITION_GLYPH[responseKind] ?? RESPONSE_POSITION_GLYPH.stance;
  return <>{glyph({ position, selected })}</>;
}

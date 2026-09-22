import * as React from 'react';

import type { ResponseKind } from '~/core/responses/entity-response';

import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';
import { VoteArrow } from '~/design-system/icons/vote-arrow';

type Props = {
  responseKind: ResponseKind;
  /** The side this glyph stands for: `true` is the positive one (Upvote / Agree / Verify). */
  position: boolean;
  /** Whether the viewer holds this side. Only the glyphs that have a filled form can say so. */
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
    // A stroke with no interior, so there is no filled form to switch to and `selected` goes
    // unread. The control around it says which side is held — a fill, a colour, an `aria-pressed`.
    veracity: ({ position }) => (position ? <ChevronUp /> : <ChevronDown />),
    stance: ({ position, selected }) => (position ? <ThumbUp filled={selected} /> : <ThumbDown filled={selected} />),
    curation: ({ position, selected }) => <VoteArrow direction={position ? 'up' : 'down'} filled={selected} />,
  };

/**
 * The glyph for one side of a response, chosen by what the response *means*.
 *
 * An arrow for curation, a thumb for a stance, a chevron for a veracity claim. The three are not
 * decoration: upvoting, agreeing and verifying are different acts, and a thumb on "the SEC sued
 * Coinbase" reads as approval rather than confirmation.
 *
 * It did not start in one place. The mapping was written out three times — the entity vote buttons
 * (through a `variant` derived from nothing but the kind), the claim ticker over the video, and the
 * position pills — and the pills' copy was the one that never got the veracity branch, so a factual
 * claim was thumbed in the claims side panel while the ticker directly above it drew a chevron for
 * the very same claim.
 *
 * `selected` is deliberately advisory rather than required: the veracity chevron has no filled form
 * and ignores it. Callers that pass it anyway are not wrong; it simply has nothing to change there.
 *
 * No `color` on any of them: each takes `currentColor` from the button it sits in. Pinning a colour
 * here would let one glyph answer for its own shade while its neighbours read the control's, which
 * is how the three spellings drifted apart in the first place.
 */
export function ResponsePositionIcon({ responseKind, position, selected = false }: Props) {
  return <>{RESPONSE_POSITION_GLYPH[responseKind]({ position, selected })}</>;
}

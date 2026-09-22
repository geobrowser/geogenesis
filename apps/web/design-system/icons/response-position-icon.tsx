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
 * The glyph for one side of a response, chosen by what the response *means*.
 *
 * An arrow for curation, a thumb for a stance, a chevron for a veracity claim. The three are not
 * decoration: upvoting, agreeing and verifying are different acts, and a thumb on "the SEC sued
 * Coinbase" reads as approval rather than confirmation. `ENTITY_RESPONSE_COPY` already centralises
 * the words each kind uses; this is the other half of that vocabulary, and it belongs in one place
 * for the same reason the words do.
 *
 * It did not start in one place. The mapping was written out three times — the entity vote buttons
 * (through a `variant` derived from nothing but the kind), the claim ticker over the video, and the
 * position pills — and the pills' copy was the one that never got the veracity branch, so a factual
 * claim was thumbed in the claims side panel while the ticker directly above it drew a chevron for
 * the very same claim.
 *
 * `selected` is deliberately advisory rather than required. A chevron is a stroke with no interior
 * and has no filled form, so on a veracity claim the held side has to be said by the control around
 * the glyph — a fill, a colour, an `aria-pressed`. Callers that pass `selected` anyway are not
 * wrong; it simply has nothing to change there.
 *
 * No `color` on any of them: each takes `currentColor` from the button it sits in. Pinning a colour
 * here would let one glyph answer for its own shade while its neighbours read the control's, which
 * is how the three spellings drifted apart in the first place.
 */
export function ResponsePositionIcon({ responseKind, position, selected = false }: Props) {
  if (responseKind === 'veracity') {
    return position ? <ChevronUp /> : <ChevronDown />;
  }

  if (responseKind === 'stance') {
    return position ? <ThumbUp filled={selected} /> : <ThumbDown filled={selected} />;
  }

  return <VoteArrow direction={position ? 'up' : 'down'} filled={selected} />;
}

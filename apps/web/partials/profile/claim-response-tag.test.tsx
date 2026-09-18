import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { ClaimResponseTag } from './claim-response-tag';

/**
 * How the person whose record this is answered a claim (GEO-2859).
 *
 * A visitor could see *which* claims somebody had answered and not *how* — a
 * record of attention with the verdict left out.
 *
 * The wording follows the claim's own question. A claim marked factual asks
 * Verify or Dispute rather than Agree or Disagree, so a tag that always said
 * "agreed" would contradict the controls beside it on exactly the claims where
 * the distinction matters — and 18 of the reference account's 208 positions are
 * answered that way.
 */
describe('ClaimResponseTag', () => {
  afterEach(cleanup);

  it('says how they came down on an ordinary claim', () => {
    render(<ClaimResponseTag response={{ stance: 'agree' }} responseKind="stance" />);

    expect(screen.getByText('agreed')).toBeInTheDocument();
  });

  it('says disagreed for the other side', () => {
    render(<ClaimResponseTag response={{ stance: 'disagree' }} responseKind="stance" />);

    expect(screen.getByText('disagreed')).toBeInTheDocument();
  });

  it('uses the factual vocabulary on a factual claim', () => {
    render(<ClaimResponseTag response={{ veracity: 'agree' }} responseKind="veracity" />);

    expect(screen.getByText('verified')).toBeInTheDocument();
  });

  it('says disputed for the other side of a factual claim', () => {
    render(<ClaimResponseTag response={{ veracity: 'disagree' }} responseKind="veracity" />);

    expect(screen.getByText('disputed')).toBeInTheDocument();
  });

  // The two answers are separate votes on separate questions, so one does not
  // stand in for the other — showing a stance where the card asks about veracity
  // would report an answer they never gave to the question on screen.
  it('says nothing when they answered the other question', () => {
    const { container } = render(<ClaimResponseTag response={{ stance: 'agree' }} responseKind="veracity" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the answer that matches, when they gave both', () => {
    render(<ClaimResponseTag response={{ stance: 'agree', veracity: 'disagree' }} responseKind="veracity" />);

    expect(screen.getByText('disputed')).toBeInTheDocument();
    expect(screen.queryByText('agreed')).not.toBeInTheDocument();
  });

  it('says nothing for a claim they have not answered', () => {
    const { container } = render(<ClaimResponseTag response={undefined} responseKind="stance" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing when they answered "neither"', () => {
    // Which reaches here as no side at all — a greyed tag would imply a verdict
    // that was never given.
    const { container } = render(<ClaimResponseTag response={{}} responseKind="stance" />);

    expect(container).toBeEmptyDOMElement();
  });
});

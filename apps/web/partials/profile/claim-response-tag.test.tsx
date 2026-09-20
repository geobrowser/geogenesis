import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { ClaimResponseTag, firstName } from './claim-response-tag';

/**
 * How the person whose record this is answered a claim (GEO-2859).
 *
 * A visitor could see *which* claims somebody had answered and not *how* — a
 * record of attention with the verdict left out.
 *
 * Two things carry the meaning together. The **wording** follows the claim's own
 * question: a claim marked factual asks Verify or Dispute rather than Agree or
 * Disagree, so a tag that always said "agrees" would contradict the control
 * above it on exactly the claims where the distinction matters — 18 of the
 * reference account's 208 positions are answered that way. The **placement**
 * says which side: the tag renders inside one of the two response cells, so
 * `forPosition` decides whether it appears at all.
 */
describe('ClaimResponseTag', () => {
  afterEach(cleanup);

  it('says how they come down on an ordinary claim', () => {
    render(<ClaimResponseTag response={{ stance: 'agree' }} responseKind="stance" forPosition />);

    expect(screen.getByText('agrees')).toBeInTheDocument();
  });

  it('says disagrees for the other side', () => {
    render(<ClaimResponseTag response={{ stance: 'disagree' }} responseKind="stance" forPosition={false} />);

    expect(screen.getByText('disagrees')).toBeInTheDocument();
  });

  it('uses the factual vocabulary on a factual claim', () => {
    render(<ClaimResponseTag response={{ veracity: 'agree' }} responseKind="veracity" forPosition />);

    expect(screen.getByText('verifies')).toBeInTheDocument();
  });

  it('says disputes for the other side of a factual claim', () => {
    render(<ClaimResponseTag response={{ veracity: 'disagree' }} responseKind="veracity" forPosition={false} />);

    expect(screen.getByText('disputes')).toBeInTheDocument();
  });

  /**
   * The side is said by *where* the tag is, so it appears under one button only.
   *
   * Rendering under both would be the card telling the reader this person agreed
   * and disagreed at once; rendering under the wrong one is worse still, since
   * the placement is what the reader is reading.
   */
  it('appears under the button matching their side, and not the other', () => {
    const { container } = render(
      <ClaimResponseTag response={{ stance: 'agree' }} responseKind="stance" forPosition={false} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('puts a disagreement under Disagree rather than Agree', () => {
    const { container } = render(
      <ClaimResponseTag response={{ stance: 'disagree' }} responseKind="stance" forPosition />
    );

    expect(container).toBeEmptyDOMElement();
  });

  // The two answers are separate votes on separate questions, so one does not
  // stand in for the other — showing a stance where the card asks about veracity
  // would report an answer they never gave to the question on screen.
  it('says nothing when they answered the other question', () => {
    const { container } = render(
      <ClaimResponseTag response={{ stance: 'agree' }} responseKind="veracity" forPosition />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the answer that matches, when they gave both', () => {
    render(
      <ClaimResponseTag
        response={{ stance: 'agree', veracity: 'disagree' }}
        responseKind="veracity"
        forPosition={false}
      />
    );

    expect(screen.getByText('disputes')).toBeInTheDocument();
    expect(screen.queryByText('agrees')).not.toBeInTheDocument();
  });

  it('says nothing for a claim they have not answered', () => {
    const { container } = render(<ClaimResponseTag response={undefined} responseKind="stance" forPosition />);

    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing when they answered "neither"', () => {
    // Which reaches here as no side at all — a greyed tag would imply a verdict
    // that was never given. In practice the tab filters these claims out before
    // they reach a card at all, since "neither" is a retraction rather than an
    // answer; this is the rendering of last resort.
    const { container } = render(<ClaimResponseTag response={{}} responseKind="stance" forPosition />);

    expect(container).toBeEmptyDOMElement();
  });

  /**
   * Named, because the card is about two people at once.
   *
   * Its Agree/Disagree pills are the *viewer's* — they publish the viewer's own
   * position — so a verdict sitting under them saying "They agree" leaves the
   * reader to work out which of the two it means.
   */
  it('names the person whose record it is', () => {
    render(
      <ClaimResponseTag response={{ stance: 'agree' }} responseKind="stance" personName="Susan Winter" forPosition />
    );

    expect(screen.getByText(/Susan/)).toBeInTheDocument();
    expect(screen.queryByText(/Winter/)).not.toBeInTheDocument();
  });

  it('falls back to "They" before the name has loaded', () => {
    render(<ClaimResponseTag response={{ stance: 'agree' }} responseKind="stance" forPosition />);

    expect(screen.getByText(/They/)).toBeInTheDocument();
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('Susan Winter')).toBe('Susan');
  });

  it('returns a mononym unchanged', () => {
    expect(firstName('Bourached')).toBe('Bourached');
  });

  it('ignores the whitespace a freely-typed name arrives with', () => {
    expect(firstName('  Nico   Lagan ')).toBe('Nico');
  });

  it('has nothing for a name that is missing or blank', () => {
    expect(firstName(null)).toBeNull();
    expect(firstName('   ')).toBeNull();
  });
});

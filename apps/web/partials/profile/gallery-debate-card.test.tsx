import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { ProfileActivitySection } from './profile-activity-section';

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: () => undefined,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: React.ComponentPropsWithoutRef<'a'>) => <a href={href}>{children}</a>,
}));

vi.mock('./gallery-claim-card', () => ({ GalleryClaimCard: () => null }));

const DEBATE_ID = '5f0c3bb2-7f0e-4d0a-9d4c-1b2a3c4d5e6f';
const DEBATE_HEX = '5f0c3bb27f0e4d0a9d4c1b2a3c4d5e6f';

vi.mock('~/core/templates/adapters/use-debate-participants-batch', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/templates/adapters/use-debate-participants-batch')>()),
  useDebateParticipantsBatch: () => ({
    data: {
      [DEBATE_HEX]: {
        slot1: { name: 'Avery Stone', avatarUrl: null, position: 'Disagree' },
        slot2: { name: 'Jordan Lee', avatarUrl: null, position: 'Agree' },
      },
    },
  }),
}));

const debateRow = {
  entityId: DEBATE_ID,
  spaceId: 'space-1',
  types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }],
  createdAtSec: 1_763_000_000,
  title: 'Avery Stone vs. Jordan Lee on Cities should ban cars downtown',
  description: null,
  imageUrl: null,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: { entityId: 'claim-1', name: 'Cities should ban cars downtown' },
  commentCount: 0,
  isMemberOrEditor: false,
} as ExploreFeedRow;

const kind = (over = {}) => ({
  key: 'debates',
  label: 'Debates',
  rows: [debateRow],
  total: 1,
  isLoading: false,
  href: '/space/s/debates',
  seeAllLabel: 'View all debates',
  ...over,
});

/**
 * The Activity gallery's debates on a profile, a space's Overview and a claim page (GEO-3871).
 * All three render `ProfileActivitySection`, so this renders its real debate card.
 */
describe('Activity gallery debate card', () => {
  afterEach(() => {
    cleanup();
    mocks.capture.mockReset();
  });

  it('draws the Topic page card: claim over the video, a chip per speaker, one link to the debate', () => {
    render(<ProfileActivitySection kinds={[kind()]} />);

    const card = document.querySelector<HTMLElement>('[data-debate-gallery-card]');
    expect(card).not.toBeNull();

    const link = within(card!).getByRole('link', { name: 'Watch debate: Cities should ban cars downtown' });
    expect(link).toHaveAttribute('href', expect.stringContaining(DEBATE_ID));

    expect(card!.querySelector('[data-debate-claim-overlay]')).toHaveTextContent('Cities should ban cars downtown');
    expect(card!.querySelector('[data-speaker-chip="top"]')).toHaveTextContent('Avery Stone· Disagree');
    expect(card!.querySelector('[data-speaker-chip="bottom"]')).toHaveTextContent('Jordan Lee· Agree');

    // Both chips sit the same distance off their panel's bottom edge; the play button on the seam
    // draws over the top chip instead of the chip moving up out of its way.
    const topChip = card!.querySelector('[data-speaker-chip="top"]');
    const bottomChip = card!.querySelector('[data-speaker-chip="bottom"]');
    expect(topChip).toHaveClass('bottom-2');
    expect(bottomChip).toHaveClass('bottom-2');
    expect(topChip).not.toHaveClass('bottom-7');
    // With no owner action, the bottom chip runs to the card's own right inset.
    expect(bottomChip).toHaveClass('right-2.5');
    const zOf = (el: Element | null) => Number(/z-\[(\d+)\]/.exec(el?.className ?? '')?.[1] ?? 0);
    expect(zOf(card!.querySelector('[data-debate-play]'))).toBeGreaterThan(zOf(topChip));

    // Votes, the split and the overflow menu live on the debate page, not on the card.
    expect(within(card!).queryByRole('button', { name: /agree|disagree|more/i })).not.toBeInTheDocument();
    expect(within(card!).queryAllByRole('button')).toHaveLength(0);
  });

  it('credits an open to the Activity gallery, as the feed card did', () => {
    render(<ProfileActivitySection kinds={[kind()]} />);

    fireEvent.click(screen.getByRole('link', { name: /Watch debate/ }));

    expect(mocks.capture).toHaveBeenCalledWith(
      'element_clicked',
      expect.objectContaining({
        component: 'explore_feed_card',
        target_id: DEBATE_ID,
        list_id: 'profile_activity',
        item_position: 1,
        variant: 'debate_gallery_card',
        element_action: 'open',
      })
    );
  });

  it("keeps the owner's Hide control on the card, outside the link", () => {
    const onHide = vi.fn();
    render(
      <ProfileActivitySection
        kinds={[
          kind({
            debateEndSlot: () => (
              <button type="button" onClick={onHide}>
                Hide from profile
              </button>
            ),
          }),
        ]}
      />
    );

    const hide = screen.getByRole('button', { name: 'Hide from profile' });
    expect(hide.closest('a')).toBeNull();
    expect(hide.closest('[data-debate-gallery-card]')).not.toBeNull();
    // The bottom speaker's chip stops short of the Hide chip in the same corner, so a long name
    // truncates before its stance instead of the Hide chip covering it.
    const bottomChip = hide.closest('[data-debate-gallery-card]')!.querySelector('[data-speaker-chip="bottom"]');
    expect(bottomChip).toHaveClass('right-12');
    expect(bottomChip).not.toHaveClass('right-2.5');
    fireEvent.click(hide);
    expect(onHide).toHaveBeenCalled();
  });
});

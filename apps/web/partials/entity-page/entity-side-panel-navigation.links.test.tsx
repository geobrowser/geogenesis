import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ClaimProvenance } from '~/core/claims/browse/claim-provenance';
import { DebateCommentRow } from '~/core/claims/browse/debate-comment-row';
import { ExtractedClaimRow } from '~/core/claims/browse/extracted-claim-row';
import { AUTHORS_PROPERTY_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import type { Relation } from '~/core/types';

import type { CommentWithReplies } from '~/partials/comments/types';
import { ExploreCardEntityLink } from '~/partials/explore/explore-card-entity-link';

import { EntitySidePanelNavigation } from './entity-side-panel-navigation';

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ENTITY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PROFILE = 'cccccccccccccccccccccccccccccccc';
const RELATED = 'dddddddddddddddddddddddddddddddd';
const mocks = vi.hoisted(() => ({
  openSidePanel: vi.fn(),
  capture: vi.fn(),
  personProfileOpened: vi.fn(),
  outerClick: vi.fn(),
  profileLoaded: true,
}));
vi.mock('~/core/debates/rematch-panel-context', () => ({ useRematchPanelContext: () => ({}) }));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel, sidePanelTarget: null }),
}));
vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: mocks.profileLoaded ? { topicId: PROFILE, entity: { id: ENTITY } } : null }),
}));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, personProfileOpened: mocks.personProfileOpened }));
vi.mock('~/core/action-context-provider', () => ({ useActionContext: () => () => ({ feed_version: 'v1' }) }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    entityId: _entityId,
    spaceId: _spaceId,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { entityId?: string; spaceId?: string }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('~/core/hooks/use-comment-count', () => ({ useCommentCount: () => 0 }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ EntityVoteButtons: () => null }));
vi.mock('~/partials/comments/entity-comments-button', () => ({ EntityCommentsButton: () => null }));
vi.mock('~/core/claims/browse/claim-comment-position', () => ({ ClaimCommentPositionBadge: () => null }));
vi.mock('~/partials/comments/inline-comment-composer', () => ({
  useInlineComposer: () => ({ isComposing: false, toggle: vi.fn() }),
  InlineCommentComposer: () => null,
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({
    entities: [{ relations: [{ type: { id: AUTHORS_PROPERTY_ID }, toEntity: { id: SPACE } }] }],
  }),
  useQueryEntity: () => ({ entity: null }),
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({
    profilesBySpaceId: new Map([
      [SPACE, { id: PROFILE, spaceId: SPACE, name: 'Ada', profileLink: `/space/${SPACE}/${PROFILE}` }],
    ]),
  }),
}));
function Boundary({ children }: { children: React.ReactNode }) {
  return (
    <div onClick={mocks.outerClick}>
      <EntitySidePanelNavigation entityId={ENTITY} spaceId={SPACE}>
        {children}
      </EntitySidePanelNavigation>
    </div>
  );
}
function ProfileRows({ kind }: { kind: 'speaker' | 'author' }) {
  return (
    <Boundary>
      {kind === 'speaker' ? (
        <ExtractedClaimRow
          claim={{
            id: RELATED,
            text: 'A claim',
            spaceId: SPACE,
            blockId: 'block',
            timing: null,
            publishedTiming: null,
            highlightScore: null,
            relationEntityId: null,
            restated: false,
          }}
          debateId={ENTITY}
          debateSpaceId={SPACE}
          responseKind="stance"
          speaker={{ spaceId: SPACE, name: 'Ada' }}
          speakerPosition={null}
          depth={2}
        />
      ) : (
        <DebateCommentRow
          comment={
            {
              id: 'comment',
              markdownContent: 'A comment',
              author: { spaceId: SPACE, name: 'Ada' },
              createdAt: '2026-09-01T00:00:00Z',
              replies: [],
            } as unknown as CommentWithReplies
          }
          targetEntityId={ENTITY}
          spaceId={SPACE}
          depth={2}
        />
      )}
    </Boundary>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profileLoaded = true;
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([
  ['speaker', 0],
  ['speaker', 1],
  ['author', 0],
  ['author', 1],
] as const)('opens the resolved %s profile from link %s in the room panel', (kind, index) => {
  render(<ProfileRows kind={kind} />);
  fireEvent.click(screen.getAllByRole('link', { name: 'Ada' })[index]!);
  expect(mocks.openSidePanel).toHaveBeenCalledExactlyOnceWith(PROFILE, SPACE, false, { forceRequestedSpace: true });
  expect(mocks.personProfileOpened).toHaveBeenCalledTimes(1);
  expect(window.open).not.toHaveBeenCalled();
  expect(mocks.outerClick).not.toHaveBeenCalled();
});
it('waits for a clicked speaker profile to resolve without opening its fallback space page', () => {
  mocks.profileLoaded = false;
  const view = render(<ProfileRows kind="speaker" />);
  fireEvent.click(screen.getAllByRole('link', { name: 'Ada' })[1]!);
  expect(mocks.openSidePanel).not.toHaveBeenCalled();
  expect(window.open).not.toHaveBeenCalled();
  mocks.profileLoaded = true;
  view.rerender(<ProfileRows kind="speaker" />);
  expect(mocks.openSidePanel).toHaveBeenCalledExactlyOnceWith(PROFILE, SPACE, false, { forceRequestedSpace: true });
});
it.each([false, true])('records one Explore open and opens one panel when opensSidePanel is %s', opensSidePanel => {
  render(
    <Boundary>
      <ExploreCardEntityLink item={{ entityId: RELATED, spaceId: SPACE, types: [] }} opensSidePanel={opensSidePanel}>
        Related claim
      </ExploreCardEntityLink>
    </Boundary>
  );
  fireEvent.click(screen.getByText('Related claim'));
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    'element_clicked',
    expect.objectContaining({ feed_version: 'v1', source: 'explore_feed_card', element_action: 'open' })
  );
  expect(mocks.openSidePanel).toHaveBeenCalledExactlyOnceWith(
    RELATED,
    SPACE,
    false,
    expect.objectContaining({ forceRequestedSpace: true })
  );
  expect(mocks.outerClick).not.toHaveBeenCalled();
  expect(window.open).not.toHaveBeenCalled();
});
it('records an Explore debate open once while opening its video in a separate tab', () => {
  render(
    <Boundary>
      <ExploreCardEntityLink
        item={{ entityId: RELATED, spaceId: SPACE, types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }] }}
        opensSidePanel
      >
        Debate
      </ExploreCardEntityLink>
    </Boundary>
  );
  fireEvent.click(screen.getByText('Debate'));
  expect(mocks.capture).toHaveBeenCalledTimes(1);
  expect(window.open).toHaveBeenCalledExactlyOnceWith(
    new URL(`/space/${SPACE}/${RELATED}`, window.location.href).href,
    '_blank',
    'noopener,noreferrer'
  );
  expect(mocks.openSidePanel).not.toHaveBeenCalled();
});
it('records claim attribution navigation while opening the profile in the room panel', () => {
  render(
    <Boundary>
      <ClaimProvenance
        claimId={ENTITY}
        spaceId={SPACE}
        claimRelations={[{ type: { id: SOURCES_PROPERTY_ID }, toEntity: { id: RELATED, name: 'Source' } } as Relation]}
      />
    </Boundary>
  );
  fireEvent.click(screen.getByRole('link', { name: 'Ada' }));
  expect(mocks.personProfileOpened).toHaveBeenCalledExactlyOnceWith(SPACE, PROFILE, {
    interaction_surface: 'claim_provenance',
  });
  expect(mocks.openSidePanel).toHaveBeenCalledTimes(1);
  expect(mocks.outerClick).not.toHaveBeenCalled();
});

import { fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';

import { RankingEntryRow, RankingEntryRowSkeleton } from './ranking-entry-row';
import { RankingEntryVoteControls } from './ranking-entry-vote-controls';

vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMedia: () => ({ avatarUrl: null, coverUrl: null }),
  useImageUrlFromEntity: () => null,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <button aria-label="Upvote" data-entity-id={entityId} data-space-id={spaceId} data-vote-actions />
  ),
}));

const entry = {
  entityId: 'entity-1',
  name: 'First entity',
  description: null,
  image: null,
} as RankingEntryDisplay;

describe('RankingEntryRow', () => {
  it('keeps browse-only vote actions out of the reusable row', () => {
    const markup = renderToStaticMarkup(<RankingEntryRow entry={entry} spaceId="space-1" />);

    expect(markup).not.toContain('data-vote-actions');
  });

  it('reserves vote-control width in browse loading rows', () => {
    const markup = renderToStaticMarkup(<RankingEntryRowSkeleton rank={1} reserveVoteControls />);

    expect(markup).toContain('w-16');
  });

  it('passes the resolved entity space to votes and isolates their interactions', () => {
    const onPointerDown = vi.fn();
    const onMouseDown = vi.fn();
    const onTouchStart = vi.fn();
    const onClick = vi.fn();

    render(
      <div onPointerDown={onPointerDown} onMouseDown={onMouseDown} onTouchStart={onTouchStart} onClick={onClick}>
        <RankingEntryVoteControls entityId="entity-1" spaceId="entity-space-1" />
      </div>
    );

    const voteButton = screen.getByRole('button', { name: 'Upvote' });
    expect(voteButton.parentElement?.className).toContain('pointer-events-auto');
    expect(voteButton.dataset.entityId).toBe('entity-1');
    expect(voteButton.dataset.spaceId).toBe('entity-space-1');

    fireEvent.pointerDown(voteButton);
    fireEvent.mouseDown(voteButton);
    fireEvent.touchStart(voteButton);
    fireEvent.click(voteButton);

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onMouseDown).not.toHaveBeenCalled();
    expect(onTouchStart).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});

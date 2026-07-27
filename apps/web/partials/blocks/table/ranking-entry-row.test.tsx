import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { RankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';

import { RankingEntryRow } from './ranking-entry-row';

vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMedia: () => ({ avatarUrl: null, coverUrl: null }),
  useImageUrlFromEntity: () => null,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-vote-actions />,
}));

const entry = {
  entityId: 'entity-1',
  name: 'First entity',
  description: null,
  image: null,
} as RankingEntryDisplay;

describe('RankingEntryRow', () => {
  it('renders vote actions when used in a ranking browse view', () => {
    const markup = renderToStaticMarkup(<RankingEntryRow entry={entry} spaceId="space-1" showVotes />);

    expect(markup).toContain('data-vote-actions="true"');
  });

  it('keeps vote actions out of compose rows by default', () => {
    const markup = renderToStaticMarkup(<RankingEntryRow entry={entry} spaceId="space-1" />);

    expect(markup).not.toContain('data-vote-actions');
  });
});

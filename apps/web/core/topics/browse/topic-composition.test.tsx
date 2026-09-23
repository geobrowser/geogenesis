import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { EPISODE_TYPE_ID, NEWS_STORY_TYPE_ID } from '../ontology';
import { TopicComposition } from './topic-composition';
import { TOPIC_FEED_ENTITY_TYPES } from './topic-feed-types';

const mocks = vi.hoisted(() => ({
  typeCounts: {} as Record<string, number>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { typeCounts: mocks.typeCounts },
    isLoading: false,
  }),
}));

afterEach(cleanup);

describe('TopicComposition', () => {
  it('summarizes every feed type and segments the types with results', () => {
    mocks.typeCounts = Object.fromEntries(TOPIC_FEED_ENTITY_TYPES.map(type => [type.id, 0]));
    mocks.typeCounts[DEBATE_TYPE_ID] = 3;
    mocks.typeCounts[CLAIM_TYPE_ID] = 41;
    mocks.typeCounts[NEWS_STORY_TYPE_ID] = 6;
    mocks.typeCounts[EPISODE_TYPE_ID] = 2;

    render(
      <TopicComposition
        topicId="00000000-0000-0000-0000-000000000001"
        spaceId="00000000-0000-0000-0000-000000000002"
        spaceIds={['00000000000000000000000000000003']}
      />
    );

    const composition = screen.getByRole('region', { name: 'What this topic holds' });
    expect(composition).toHaveTextContent('3 debates');
    expect(composition).toHaveTextContent('41 claims');
    expect(composition).toHaveTextContent('6 news stories');
    expect(composition).toHaveTextContent('2 episodes');
    expect(composition).toHaveTextContent('0 articles');
    expect(composition).toHaveTextContent('0 datasets');

    const segments = composition.firstElementChild?.children;
    expect(segments).toHaveLength(4);
    expect((segments?.[0] as HTMLElement).style.width).toBe(`${(3 / 52) * 100}%`);
    expect((segments?.[1] as HTMLElement).style.width).toBe(`${(41 / 52) * 100}%`);
    expect((segments?.[2] as HTMLElement).style.width).toBe(`${(6 / 52) * 100}%`);
    expect((segments?.[3] as HTMLElement).style.width).toBe(`${(2 / 52) * 100}%`);
  });
});

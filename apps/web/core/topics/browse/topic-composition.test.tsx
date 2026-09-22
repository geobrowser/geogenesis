import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopicComposition } from './topic-composition';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { debates: 3, claims: 41, news: 6 },
    isLoading: false,
  }),
}));

afterEach(cleanup);

describe('TopicComposition', () => {
  it('summarizes only debates, claims, and news stories', () => {
    render(
      <TopicComposition topicId="00000000-0000-0000-0000-000000000001" spaceId="00000000-0000-0000-0000-000000000002" />
    );

    const composition = screen.getByRole('region', { name: 'What this topic holds' });
    expect(composition).toHaveTextContent('3 debates');
    expect(composition).toHaveTextContent('41 claims');
    expect(composition).toHaveTextContent('6 news stories');
    expect(composition).not.toHaveTextContent(/episodes|posts|other/);

    const segments = composition.firstElementChild?.children;
    expect(segments).toHaveLength(3);
    expect((segments?.[0] as HTMLElement).style.width).toBe('6%');
    expect((segments?.[1] as HTMLElement).style.width).toBe('82%');
    expect((segments?.[2] as HTMLElement).style.width).toBe('12%');
  });
});

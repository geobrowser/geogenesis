import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionContextProvider, useActionContext } from '~/core/action-context-provider';
import type { FollowTarget } from '~/core/follows/follow-button';

import { ExploreCardTopicFollow } from './explore-card-topic-follow';

vi.mock('~/core/follows/follow-button', () => ({
  FollowButton: ({ target }: { target: FollowTarget }) => {
    const getContext = useActionContext('topic_follow_button', 'topic', target.id);
    return (
      <button type="button" data-component={getContext().component}>
        Follow {target.name}
      </button>
    );
  },
}));

const CLIMATE = { id: 'topic-a', name: 'Climate' };
const FINANCE = { id: 'topic-b', name: 'Finance' };
const ENERGY = { id: 'topic-c', name: 'Energy' };

const renderInCard = (ui: React.ReactElement) =>
  render(
    <ActionContextProvider value={{ component: 'explore_feed_card', target_id: 'claim-1', list_id: 'entity_feed' }}>
      {ui}
    </ActionContextProvider>
  );

afterEach(cleanup);

describe('ExploreCardTopicFollow', () => {
  it('draws nothing for an entity with no topics', () => {
    expect(renderInCard(<ExploreCardTopicFollow topics={[]} />).container.innerHTML).toBe('');
    expect(renderInCard(<ExploreCardTopicFollow topics={undefined} />).container.innerHTML).toBe('');
  });

  it('shows the first topic and its Follow, with no more-topics control when it is the only one', () => {
    renderInCard(<ExploreCardTopicFollow topics={[CLIMATE]} />);

    expect(screen.getByText('Climate')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Follow Climate' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /more topic/ })).toBeNull();
  });

  it('keeps the card’s order: the first topic on the row, the rest behind +N', () => {
    renderInCard(<ExploreCardTopicFollow topics={[FINANCE, CLIMATE, ENERGY]} />);

    expect(screen.getByRole('button', { name: 'Follow Finance' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Follow Climate' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more topics' }));

    const list = screen.getByRole('list', { name: 'More topics' });
    expect(
      within(list)
        .getAllByRole('button')
        .map(button => button.textContent)
    ).toEqual(['Follow Climate', 'Follow Energy']);
  });

  it('does not pass the +N press on to the card underneath', () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <ExploreCardTopicFollow topics={[CLIMATE, FINANCE]} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more topic' }));
    fireEvent.click(within(screen.getByRole('list', { name: 'More topics' })).getByText('Finance'));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('records follows from the row and from the list under the card topic follow component', () => {
    renderInCard(<ExploreCardTopicFollow topics={[CLIMATE, FINANCE]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more topic' }));

    for (const name of ['Follow Climate', 'Follow Finance']) {
      expect(screen.getByRole('button', { name }).getAttribute('data-component')).toBe('explore_card_topic_follow');
    }
  });
});

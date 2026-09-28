import '@testing-library/jest-dom/vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { Provider, useAtomValue } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { NavUtils } from '~/core/utils/utils';

import { ExploreCardTitle, exploreCardHeading } from './explore-card-title';
import { entitySidePanelAtom } from '~/atoms';

// Forwards everything to a real anchor: the heading's behaviour is its `href`, its `onClick` and
// its opener data attribute, and a mock that kept only `href` would render a link that does nothing.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    entityId: _entityId,
    spaceId: _spaceId,
    ...rest
  }: {
    children: React.ReactNode;
    entityId?: string;
    spaceId?: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...rest}>{children}</a>,
}));

const CLAIM_NAME = 'Fast fashion should be discouraged with higher taxation';

const article: ExploreFeedItem = {
  entityId: 'entity-1',
  spaceId: 'space-1',
  spaceName: 'Fashion',
  spaceImage: null,
  types: [],
  createdAtSec: 0,
  title: 'A regular entity',
  description: null,
  imageUrl: null,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: null,
  commentCount: 0,
  isMemberOrEditor: true,
  hasPendingMembershipRequest: false,
};

const debate: ExploreFeedItem = {
  ...article,
  entityId: 'debate-1',
  types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }],
  // What `debate-publish-draft` actually names a Debate entity: the debaters, then the motion.
  title: `Ada vs. Blaise on ${CLAIM_NAME}`,
  debateClaim: { entityId: 'claim-1', name: CLAIM_NAME },
};

function PanelProbe() {
  const target = useAtomValue(entitySidePanelAtom);
  return <div data-testid="panel">{target ? `${target.entityId} in ${target.spaceId}` : 'closed'}</div>;
}

function renderTitle(item: ExploreFeedItem, opensSidePanel = false) {
  return render(
    <Provider>
      <ExploreCardTitle item={item} opensSidePanel={opensSidePanel} />
      <PanelProbe />
    </Provider>
  );
}

/** Dispatches a click the way a browser would, so `defaultPrevented` is observable. */
function clickTitle(init?: MouseEventInit) {
  const anchor = screen.getByRole('link');
  const event = createEvent.click(anchor, init);
  fireEvent(anchor, event);
  return event;
}

afterEach(cleanup);

describe('exploreCardHeading', () => {
  it('heads an ordinary card with its own name, opening itself', () => {
    expect(exploreCardHeading(article)).toEqual({ text: 'A regular entity', target: article });
  });

  it('heads a debate with the claim it argued, opening the claim', () => {
    expect(exploreCardHeading(debate)).toEqual({
      text: CLAIM_NAME,
      target: { entityId: 'claim-1', spaceId: 'space-1', types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }] },
    });
  });

  it('falls back to the debate entity name when the Claims relation is missing', () => {
    const unrelated = { ...debate, debateClaim: null };
    expect(exploreCardHeading(unrelated)).toEqual({ text: unrelated.title, target: unrelated });
  });
});

describe('ExploreCardTitle', () => {
  it('renders the claim as the heading of a debate card', () => {
    renderTitle(debate);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(CLAIM_NAME);
    expect(screen.queryByText(debate.title)).toBeNull();
  });

  it('points a debate heading at the claim entity, not at the debate', () => {
    renderTitle(debate);

    expect(screen.getByRole('link')).toHaveAttribute('href', NavUtils.toEntity('space-1', 'claim-1'));
  });

  it('opens the claim in the side panel on a surface that has opted in', () => {
    renderTitle(debate, true);

    const event = clickTitle();

    expect(screen.getByTestId('panel')).toHaveTextContent('claim-1 in space-1');
    expect(event.defaultPrevented).toBe(true);
  });

  // The attribute is what exempts the link from the panel's outside-pointerdown close, so an open
  // panel switches targets instead of tearing down and rebuilding. `ExploreCardEntityLink` withholds
  // it from debates (GEO-2794); typing the target as a Claim is what keeps that rule off this link.
  it('marks a debate heading as a side-panel opener, because it opens a claim', () => {
    renderTitle(debate, true);

    expect(screen.getByRole('link')).toHaveAttribute('data-entity-side-panel-opener');
  });

  it('leaves a modified click to the browser so the claim can open in a new tab', () => {
    renderTitle(debate, true);

    const event = clickTitle({ metaKey: true });

    expect(screen.getByTestId('panel')).toHaveTextContent('closed');
    expect(event.defaultPrevented).toBe(false);
  });

  // The data block explore view renders the same card and has not opted in.
  it('navigates to the claim on a surface that has not opted in', () => {
    renderTitle(debate);

    const event = clickTitle();

    expect(screen.getByTestId('panel')).toHaveTextContent('closed');
    expect(event.defaultPrevented).toBe(false);
  });

  // Falling back to the debate's own name means falling back to the debate as the target, and a
  // debate is the full-screen video experience GEO-2794 keeps out of the panel.
  it('still navigates when the heading is the debate entity name', () => {
    renderTitle({ ...debate, debateClaim: null }, true);

    const event = clickTitle();

    expect(screen.getByTestId('panel')).toHaveTextContent('closed');
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves every other card headed by its own name', () => {
    renderTitle(article, true);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('A regular entity');
    expect(screen.getByRole('link')).toHaveAttribute('href', NavUtils.toEntity('space-1', 'entity-1'));
  });
});

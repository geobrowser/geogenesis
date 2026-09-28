import '@testing-library/jest-dom/vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { Provider, useAtomValue } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { NavUtils } from '~/core/utils/utils';

import { ExploreCardEntityLink } from './explore-card-entity-link';
import { entitySidePanelAtom } from '~/atoms';

// The real one reaches for the sync engine and the router. What matters here is that it forwards
// everything to a real anchor, which is the contract this component depends on — `href` and
// `onClick`, and the opener data attribute, which is a prop like any other.
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

const item = { entityId: 'entity-1', spaceId: 'space-1', types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }] };
const debateItem = { entityId: 'debate-1', spaceId: 'space-1', types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }] };

function PanelProbe() {
  const target = useAtomValue(entitySidePanelAtom);
  return <div data-testid="panel">{target ? `${target.entityId} in ${target.spaceId}` : 'closed'}</div>;
}

function renderLink(opensSidePanel: boolean, linkItem = item) {
  return render(
    <Provider>
      <ExploreCardEntityLink item={linkItem} opensSidePanel={opensSidePanel}>
        <h2>A claim</h2>
      </ExploreCardEntityLink>
      <PanelProbe />
    </Provider>
  );
}

/** Dispatches a click the same way a browser would, so `defaultPrevented` is observable. */
function clickName(init?: MouseEventInit) {
  const anchor = screen.getByRole('link');
  const event = createEvent.click(anchor, init);
  fireEvent(anchor, event);
  return event;
}

afterEach(cleanup);

describe('ExploreCardEntityLink', () => {
  it('opens the entity in the side panel instead of navigating', () => {
    renderLink(true);

    const event = clickName();

    expect(screen.getByTestId('panel')).toHaveTextContent('entity-1 in space-1');
    expect(event.defaultPrevented).toBe(true);
  });

  // A panel is not a page. GEO-2701 restored these across the app, and swapping the anchor for a
  // button — or intercepting every click — would take them back out on this surface alone.
  it.each([
    ['cmd/ctrl', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
  ])('leaves a %s click to the browser so it can open a new tab or window', (_label, init) => {
    renderLink(true);

    const event = clickName(init);

    expect(screen.getByTestId('panel')).toHaveTextContent('closed');
    expect(event.defaultPrevented).toBe(false);
  });

  // Not decoration: "copy link address", the status-bar preview and middle click all read the
  // attribute rather than the handler, and the panel's own "Open entity full page" is the only
  // other route to the page once the card stops navigating.
  it('keeps a real href to the entity page even while it opens the panel', () => {
    renderLink(true);

    expect(screen.getByRole('link')).toHaveAttribute('href', NavUtils.toEntity('space-1', 'entity-1'));
  });

  // The panel closes on any outside pointerdown that is not marked as an opener, and pointerdown
  // beats click. Without the marker, clicking a second card tears the panel down and the click
  // rebuilds it — a close/reopen where the viewer asked to switch targets.
  it('marks itself as a side-panel opener so an open panel switches instead of closing', () => {
    renderLink(true);

    expect(screen.getByRole('link')).toHaveAttribute('data-entity-side-panel-opener');
  });

  // The data block explore view renders this same card inside the editor, which reads the same
  // attribute. There the name navigates, so claiming to be an opener would be a lie.
  it('does not claim to be an opener on a surface that has not opted in', () => {
    renderLink(false);

    expect(screen.getByRole('link')).not.toHaveAttribute('data-entity-side-panel-opener');
  });

  it('navigates as usual on a surface that has not opted in', () => {
    renderLink(false);

    const event = clickName();

    expect(screen.getByTestId('panel')).toHaveTextContent('closed');
    expect(event.defaultPrevented).toBe(false);
  });

  // GEO-2794, amending GEO-2757. A debate is a full-screen video experience; the panel would be a
  // worse version of the thing the reader is trying to reach, so its title navigates even here.
  describe('debates', () => {
    it('navigates to the debate instead of opening the panel', () => {
      renderLink(true, debateItem);

      const event = clickName();

      expect(screen.getByTestId('panel')).toHaveTextContent('closed');
      expect(event.defaultPrevented).toBe(false);
    });

    it('does not claim to be an opener, since it does not open anything', () => {
      // The attribute exempts a link from the panel's outside-pointerdown close. A debate title
      // that kept it would suppress that close while navigating away, leaving the panel behind.
      renderLink(true, debateItem);

      expect(screen.getByRole('link')).not.toHaveAttribute('data-entity-side-panel-opener');
    });

    it('still carries the href every other title carries', () => {
      renderLink(true, debateItem);

      expect(screen.getByRole('link')).toHaveAttribute('href', NavUtils.toEntity('space-1', 'debate-1'));
    });

    it('applies to an entity typed both debate and something else', () => {
      // Multi-typed entities are ordinary here, and the rule is "is a debate", not "is only a
      // debate" — the full-screen experience is what it has, whatever else it also is.
      renderLink(true, {
        ...debateItem,
        types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }, ...debateItem.types],
      });

      const event = clickName();

      expect(event.defaultPrevented).toBe(false);
      expect(screen.getByTestId('panel')).toHaveTextContent('closed');
    });
  });
});

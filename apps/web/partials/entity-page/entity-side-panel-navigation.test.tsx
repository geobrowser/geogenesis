import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EntitySidePanelActiveTabProvider,
  useEntitySidePanelActiveTab,
} from '~/core/state/entity-side-panel-active-tab';

const mocks = vi.hoisted(() => ({ inRematch: true, openSidePanel: vi.fn(), navigate: vi.fn() }));
vi.mock('~/core/debates/rematch-panel-context', () => ({
  useRematchPanelContext: () => (mocks.inRematch ? {} : null),
}));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel }),
}));

const { EntitySidePanelNavigation } = await import('./entity-side-panel-navigation');
const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CLAIM = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const RELATED = 'cccccccccccccccccccccccccccccccc';
const TAB = 'dddddddddddddddddddddddddddddddd';
const currentHref = `/space/${SPACE}/${CLAIM}`;
const relatedHref = `/space/${SPACE}/${RELATED}`;

function TabProbe() {
  const tabs = useEntitySidePanelActiveTab();
  return <output data-testid="tab">{tabs?.activeTabId ?? tabs?.activeSystemTab ?? 'overview'}</output>;
}
function View({
  href = relatedHref,
  portal = false,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { portal?: boolean }) {
  const link = (
    <a href={href} onClick={mocks.navigate} {...props}>
      <span>Related claim</span>
    </a>
  );
  return (
    <EntitySidePanelActiveTabProvider entityId={CLAIM} spaceId={SPACE}>
      <EntitySidePanelNavigation entityId={CLAIM} spaceId={SPACE}>
        {portal ? createPortal(link, document.body) : link}
        <button type="button" onClick={mocks.navigate}>
          Agree
        </button>
        <TabProbe />
      </EntitySidePanelNavigation>
    </EntitySidePanelActiveTabProvider>
  );
}

beforeEach(() => {
  mocks.inRematch = true;
  mocks.openSidePanel.mockReset();
  mocks.navigate.mockReset().mockImplementation((event: React.MouseEvent) => event.preventDefault());
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('debate room side-panel navigation', () => {
  it('opens a related claim in the panel before its full-page handler can run', () => {
    render(<View />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(mocks.openSidePanel).toHaveBeenCalledWith(RELATED, SPACE, false, {
      forceRequestedSpace: true,
      initialTab: undefined,
      scrollToComments: false,
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens a debate video separately and preserves its timecode', () => {
    const href = `${relatedHref}?t=722`;
    render(<View href={href} data-entity-side-panel-full-page />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(window.open).toHaveBeenCalledWith(new URL(href, window.location.href).href, '_blank', 'noopener,noreferrer');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
  });

  it('keeps portal links inside the panel too', () => {
    render(<View portal />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(mocks.openSidePanel).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('selects a system tab without changing the room route', () => {
    render(<View href={`${currentHref}/claims`} />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(screen.getByTestId('tab')).toHaveTextContent('claims');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
  });

  it('selects an authored tab without changing the room route', () => {
    render(<View href={`${currentHref}?tabId=${TAB}`} />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(screen.getByTestId('tab')).toHaveTextContent(TAB);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each([
    [`${relatedHref}/claims`, { systemTab: 'claims' }],
    [`${relatedHref}?tabId=${TAB}`, { tabId: TAB }],
  ])('preserves the destination tab for %s', (href, initialTab) => {
    render(<View href={href} />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(mocks.openSidePanel).toHaveBeenCalledWith(RELATED, SPACE, false, expect.objectContaining({ initialTab }));
  });

  it('preserves links to the comments on another claim', () => {
    render(<View href={`${relatedHref}#entity-comments`} />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(mocks.openSidePanel).toHaveBeenCalledWith(
      RELATED,
      SPACE,
      false,
      expect.objectContaining({ scrollToComments: true })
    );
  });

  it.each([
    `/space/${SPACE}`,
    '/debate/other-room',
    `${relatedHref}/power-tools`,
    `${relatedHref}/comments`,
    `${relatedHref}/activity`,
    'https://example.com/source',
  ])('opens %s separately so it cannot replace the room', href => {
    render(<View href={href} />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(window.open).toHaveBeenCalledWith(new URL(href, window.location.href).href, '_blank', 'noopener,noreferrer');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }])('preserves modified clicks: %o', modifier => {
    render(<View />);
    fireEvent.click(screen.getByText('Related claim'), modifier);
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalled();
  });

  it('allows the explicit Open in new tab link', () => {
    render(<View target="_blank" rel="noopener noreferrer" />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does not bypass a disabled link’s click handler', () => {
    render(<View aria-disabled="true" />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(mocks.navigate).toHaveBeenCalledOnce();
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('leaves position buttons alone', () => {
    render(<View />);
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    expect(mocks.navigate).toHaveBeenCalledOnce();
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
  });

  it('preserves normal navigation outside a debate-again session', () => {
    mocks.inRematch = false;
    render(<View />);
    fireEvent.click(screen.getByText('Related claim'));
    expect(mocks.navigate).toHaveBeenCalled();
    expect(mocks.openSidePanel).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});

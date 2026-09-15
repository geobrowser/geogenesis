import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateEntityId } from '~/core/utils/utils';

import {
  TOPIC_BUILT_IN_TAB_IDS,
  type TopicBuiltInTab,
  TopicTabs,
  isTopicBuiltInTabId,
  useTopicActiveTab,
} from './topic-tabs';

const mocks = vi.hoisted(() => ({
  tabId: null as string | null,
  sidePanel: null as { activeTabId: string | null; setActiveTabId: (id: string | null) => void } | null,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.tabId === null ? '' : `tabId=${mocks.tabId}`),
}));

vi.mock('~/core/state/entity-side-panel-active-tab', () => ({
  useEntitySidePanelActiveTab: () => mocks.sidePanel,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...rest }: React.ComponentProps<'a'>) => <a {...rest}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  mocks.tabId = null;
  mocks.sidePanel = null;
});

const ENTITY_TAB_ID = '0419ca20118b4cdb84dfdb9ed73b50c2';

function ActiveTab({ panelTab = 'overview' }: { panelTab?: TopicBuiltInTab }) {
  const active = useTopicActiveTab(panelTab);
  return <span data-testid="active">{`${active.builtIn}|${active.entityTabId ?? 'none'}`}</span>;
}

describe('topic tab ids', () => {
  // The whole reserved-word scheme rests on this: every reader of `tabId` in the app runs the value
  // through `validateEntityId` and treats anything else as absent. If an id could ever spell
  // `claims`, the topic page's tab would silently hijack an entity tab.
  it.each(TOPIC_BUILT_IN_TAB_IDS)('%s cannot be mistaken for an entity id', id => {
    expect(validateEntityId(id)).toBe(false);
    expect(isTopicBuiltInTabId(id)).toBe(true);
  });

  it('does not treat a real entity id as one of its own', () => {
    expect(validateEntityId(ENTITY_TAB_ID)).toBe(true);
    expect(isTopicBuiltInTabId(ENTITY_TAB_ID)).toBe(false);
  });
});

describe('useTopicActiveTab on the route', () => {
  it('opens on Overview with no tabId at all', () => {
    render(<ActiveTab />);

    expect(screen.getByTestId('active')).toHaveTextContent('overview|none');
  });

  it('reads a reserved word as one of the page’s own tabs', () => {
    mocks.tabId = 'claims';

    render(<ActiveTab />);

    expect(screen.getByTestId('active')).toHaveTextContent('claims|none');
  });

  it('reads an entity id as an editorial tab, and leaves the built-in on Overview', () => {
    mocks.tabId = ENTITY_TAB_ID;

    render(<ActiveTab />);

    expect(screen.getByTestId('active')).toHaveTextContent(`overview|${ENTITY_TAB_ID}`);
  });

  it('falls back to Overview for a tabId that is neither', () => {
    mocks.tabId = 'not-a-tab';

    render(<ActiveTab />);

    expect(screen.getByTestId('active')).toHaveTextContent('overview|none');
  });
});

describe('useTopicActiveTab in the side panel', () => {
  it('takes the built-in from panel state, because the panel’s own context would reject it', () => {
    mocks.sidePanel = { activeTabId: null, setActiveTabId: () => {} };

    render(<ActiveTab panelTab="coverage" />);

    expect(screen.getByTestId('active')).toHaveTextContent('coverage|none');
  });

  it('lets an entity tab win, so the two can never both be showing', () => {
    mocks.sidePanel = { activeTabId: ENTITY_TAB_ID, setActiveTabId: () => {} };

    render(<ActiveTab panelTab="claims" />);

    expect(screen.getByTestId('active')).toHaveTextContent(`overview|${ENTITY_TAB_ID}`);
  });

  it('ignores the host page’s URL entirely', () => {
    mocks.sidePanel = { activeTabId: null, setActiveTabId: () => {} };
    // The panel opens over whatever page the reader was on, which may itself be a topic sitting on
    // `?tabId=claims`. Reading that here would open the panel on the host's tab.
    mocks.tabId = 'claims';

    render(<ActiveTab panelTab="overview" />);

    expect(screen.getByTestId('active')).toHaveTextContent('overview|none');
  });
});

describe('TopicTabs', () => {
  const baseProps = {
    entityId: 'topic-1',
    spaceId: 'space-1',
    activeTab: { builtIn: 'overview' as const, entityTabId: null },
    onSelectBuiltIn: () => {},
    onSelectEntityTab: () => {},
    counts: { claims: 470, debates: 1, coverage: 669 },
    entityTabs: [],
  };

  it('holds its counts back until the scope they were read in has resolved', () => {
    render(<TopicTabs {...baseProps} countsReady={false} />);

    // Every built-in is offered — dropping one at zero requires knowing it is zero — but none of
    // them carries a number yet, because the number would be the graph-wide one and would step
    // down the moment the viewer's scope landed.
    expect(screen.getByRole('link', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.queryByText('470')).not.toBeInTheDocument();
  });

  it('shows the counts once they are ready', () => {
    render(<TopicTabs {...baseProps} countsReady />);

    expect(screen.getByText('470')).toBeInTheDocument();
    expect(screen.getByText('669')).toBeInTheDocument();
  });

  it('drops a built-in tab with nothing behind it rather than offering an empty one', () => {
    render(<TopicTabs {...baseProps} counts={{ claims: 470, debates: 0, coverage: 669 }} countsReady />);

    expect(screen.queryByRole('link', { name: /Debates/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Claims/ })).toBeInTheDocument();
    // Overview has no count of its own, so it can never be dropped by one.
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
  });

  it('draws the entity’s own tabs after its, and skips ones with no name', () => {
    render(
      <TopicTabs
        {...baseProps}
        countsReady
        entityTabs={[
          { id: 'tab-1', name: 'Military operations & strikes' },
          { id: 'tab-2', name: '   ' },
          { id: 'tab-3', name: 'Nuclear program' },
        ]}
      />
    );

    expect(screen.getByRole('link', { name: 'Military operations & strikes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nuclear program' })).toBeInTheDocument();
    // A tab strip cannot fall back to an id the way a chip can: it is navigation, and a row of
    // hex reads as broken rather than as unnamed.
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it('points a built-in at a reserved word and Overview at the bare entity', () => {
    render(<TopicTabs {...baseProps} countsReady />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/space/space-1/topic-1');
    expect(screen.getByRole('link', { name: /Claims/ })).toHaveAttribute('href', '/space/space-1/topic-1?tabId=claims');
  });
});

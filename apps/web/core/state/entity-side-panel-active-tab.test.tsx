import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { EntitySidePanelActiveTabProvider, useEntitySidePanelActiveTab } from './entity-side-panel-active-tab';

const AUTHORED_TAB_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function Probe() {
  const tabs = useEntitySidePanelActiveTab();
  if (!tabs) throw new Error('Probe requires an active-tab provider');

  return (
    <>
      <output data-testid="authored-tab">{tabs.activeTabId ?? 'none'}</output>
      <output data-testid="system-tab">{tabs.activeSystemTab ?? 'none'}</output>
      <button type="button" onClick={() => tabs.setActiveTabId(AUTHORED_TAB_ID)}>
        Select authored
      </button>
      <button type="button" onClick={() => tabs.setActiveSystemTab('claims')}>
        Select claims
      </button>
    </>
  );
}

function ScopedProbe({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  return (
    <EntitySidePanelActiveTabProvider entityId={entityId} spaceId={spaceId}>
      <Probe />
    </EntitySidePanelActiveTabProvider>
  );
}

describe('EntitySidePanelActiveTabProvider', () => {
  afterEach(cleanup);

  it('retains the selection while the entity and effective space stay the same', () => {
    const view = render(<ScopedProbe entityId="entity-1" spaceId="space-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select authored' }));

    view.rerender(<ScopedProbe entityId="entity-1" spaceId="space-1" />);

    expect(screen.getByTestId('authored-tab')).toHaveTextContent(AUTHORED_TAB_ID);
  });

  it('clears authored state before rendering the same entity in a different effective space', () => {
    const view = render(<ScopedProbe entityId="entity-1" spaceId="space-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select authored' }));

    view.rerender(<ScopedProbe entityId="entity-1" spaceId="space-2" />);

    expect(screen.getByTestId('authored-tab')).toHaveTextContent('none');
    expect(screen.getByTestId('system-tab')).toHaveTextContent('none');
  });

  it('clears system state before rendering a different entity', () => {
    const view = render(<ScopedProbe entityId="entity-1" spaceId="space-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select claims' }));

    view.rerender(<ScopedProbe entityId="entity-2" spaceId="space-1" />);

    expect(screen.getByTestId('authored-tab')).toHaveTextContent('none');
    expect(screen.getByTestId('system-tab')).toHaveTextContent('none');
  });
});

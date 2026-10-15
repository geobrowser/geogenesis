import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EntitySidePanelPopoverPortalContext } from '~/core/state/entity-side-panel-popover-portal';

import { Dropdown } from './dropdown';
import { Menu } from './menu';

beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function MenuHarness() {
  const [open, setOpen] = React.useState(false);
  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<span>Topics</span>}>
      <button type="button">Society and culture</button>
    </Menu>
  );
}

function DropdownHarness() {
  return (
    <Dropdown
      trigger="Topics"
      options={[{ label: 'Society and culture', value: 'society', disabled: false, onClick: () => {} }]}
    />
  );
}

describe.each([
  ['Menu', MenuHarness],
  ['Dropdown', DropdownHarness],
] as const)('%s overlay placement', (_name, Harness) => {
  it('escapes a sticky, clipped controls row and restores focus on Escape', async () => {
    const user = userEvent.setup();
    const view = render(
      <div style={{ position: 'sticky', zIndex: 10, overflow: 'hidden' }}>
        <Harness />
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Topics' });
    await user.click(trigger);

    const option = screen.getByText('Society and culture');
    expect(option).toBeVisible();
    expect(view.container).not.toContainElement(option);
    expect(option.closest('.elevated-popover')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Society and culture')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    view.unmount();
    expect(document.querySelector('.elevated-popover')).toBeNull();
  });

  it('uses the enclosing overlay host when opened inside a panel', async () => {
    const user = userEvent.setup();
    function Panel() {
      const [host, setHost] = React.useState<HTMLDivElement | null>(null);
      return (
        <EntitySidePanelPopoverPortalContext.Provider value={host}>
          <div data-testid="controls">
            <Harness />
          </div>
          <div ref={setHost} data-testid="overlay-host" />
        </EntitySidePanelPopoverPortalContext.Provider>
      );
    }
    render(<Panel />);
    await user.click(screen.getByRole('button', { name: 'Topics' }));

    expect(within(screen.getByTestId('overlay-host')).getByText('Society and culture')).toBeVisible();
    expect(within(screen.getByTestId('controls')).queryByText('Society and culture')).toBeNull();
    expect(document.querySelector('.elevated-popover')).toBeNull();
  });
});

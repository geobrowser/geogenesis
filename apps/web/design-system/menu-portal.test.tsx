import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';

import { Dropdown } from './dropdown';
import { Menu } from './menu';
import { SlideUp } from './slide-up';
import { slideUpPopoverContainerAtom } from '~/atoms';

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
  ['Menu', MenuHarness, 'button'],
  ['Dropdown', DropdownHarness, 'menuitem'],
] as const)('%s overlay placement', (_name, Harness, optionRole) => {
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

  it('keeps panel options accessible in the real overlay host', async () => {
    const user = userEvent.setup();
    render(
      <EntitySidePanelPopoverPortalProvider>
        <div data-testid="controls">
          <Harness />
        </div>
      </EntitySidePanelPopoverPortalProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Topics' }));

    const option = screen.getByRole(optionRole, { name: 'Society and culture' });
    expect(option.closest('.side-panel-elevated-popover')).toBeInTheDocument();
    expect(within(screen.getByTestId('controls')).queryByText('Society and culture')).toBeNull();
    expect(document.querySelector('.elevated-popover')).toBeNull();
  });

  it('uses the slide-up host that is exempt from the sheet scroll lock', async () => {
    const user = userEvent.setup();
    const store = createStore();
    render(
      <Provider store={store}>
        <SlideUp isOpen setIsOpen={() => {}}>
          <Harness />
        </SlideUp>
      </Provider>
    );
    await user.click(screen.getByRole('button', { name: 'Topics' }));

    const option = screen.getByRole(optionRole, { name: 'Society and culture' });
    expect(store.get(slideUpPopoverContainerAtom)).toContainElement(option);
  });
});

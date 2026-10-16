import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CalendarNarrowSheet } from '~/core/debates/matchmaking/calendar-narrow-panel';
import { EntitySidePanelPopoverPortalProvider } from '~/core/state/entity-side-panel-popover-portal';

import { SubtopicsDialogShell } from '~/partials/space-page/subtopics-dialog-shell';

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

function MenuHarness({ onSelect = () => {} }: { onSelect?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Menu open={open} onOpenChange={setOpen} trigger={<span>Topics</span>}>
      <button type="button" onClick={onSelect}>
        Society and culture
      </button>
    </Menu>
  );
}

function DropdownHarness({ onSelect = () => {} }: { onSelect?: () => void }) {
  return (
    <Dropdown
      trigger="Topics"
      options={[{ label: 'Society and culture', value: 'society', disabled: false, onClick: onSelect }]}
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

  it('accepts pointer clicks in a ranking sheet without entity-panel CSS', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <>
        {/* The two Tailwind utilities relevant to hit testing; no entity-panel override. */}
        <style>{'.pointer-events-none { pointer-events: none; } .pointer-events-auto { pointer-events: auto; }'}</style>
        <EntitySidePanelPopoverPortalProvider>
          <Harness onSelect={onSelect} />
        </EntitySidePanelPopoverPortalProvider>
      </>
    );
    await user.click(screen.getByRole('button', { name: 'Topics' }));
    await user.click(screen.getByRole(optionRole, { name: 'Society and culture' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it.each(['subtopics', 'calendar'] as const)('keeps %s modal options accessible and focusable', async modal => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const menu = <Harness onSelect={onSelect} />;
    render(
      <EntitySidePanelPopoverPortalProvider>
        {modal === 'subtopics' ? (
          <SubtopicsDialogShell open onOpenChange={() => {}} title="Subtopics" showBack={false}>
            {menu}
          </SubtopicsDialogShell>
        ) : (
          <CalendarNarrowSheet
            open
            onOpenChange={() => {}}
            picks={{ people: [], claims: [], matchesOnly: false }}
            onApply={() => {}}
            shownCount={() => 0}
            renderBody={() => menu}
          />
        )}
      </EntitySidePanelPopoverPortalProvider>
    );
    const dialog = screen.getByRole('dialog', { name: modal === 'subtopics' ? 'Subtopics' : 'Narrow the calendar' });
    const trigger = within(dialog).getByRole('button', { name: 'Topics' });
    await user.click(trigger);
    const option = screen.getByRole(optionRole, { name: 'Society and culture' });
    expect(dialog).toContainElement(option);
    expect(option.closest('[aria-hidden="true"]')).toBeNull();
    option.focus();
    expect(option).toHaveFocus();
    await user.click(option);
    expect(onSelect).toHaveBeenCalledOnce();
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

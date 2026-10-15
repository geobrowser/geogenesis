import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SpaceMembersMenu } from './space-members-menu';

beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe.each(['Manage members', 'Manage editors'])('%s dialog handoff', label => {
  it('closes the menu, keeps the dialog usable, and returns focus to the original trigger', async () => {
    const user = userEvent.setup();
    render(
      <SpaceMembersMenu trigger="Membership options" label={label} content={<input aria-label="Find participant" />} />
    );
    const trigger = screen.getByRole('button', { name: 'Membership options' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: label }));

    const dialog = screen.getByRole('dialog', { name: label });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: label, hidden: true })).not.toBeInTheDocument();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.type(within(dialog).getByRole('textbox', { name: 'Find participant' }), 'Ada');
    expect(within(dialog).getByRole('textbox')).toHaveValue('Ada');

    await user.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('dialog', { name: label })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

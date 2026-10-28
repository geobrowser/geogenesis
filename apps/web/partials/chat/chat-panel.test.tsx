import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import { ChatPanel } from './chat-panel';

vi.mock('./chat-messages', () => ({ ChatMessages: () => null }));
vi.mock('./chat-welcome', () => ({ ChatWelcome: () => null }));
beforeAll(() => {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

it('keeps Assistant actions in its own overlay layer and usable', async () => {
  const user = userEvent.setup();
  const onNewChat = vi.fn();
  render(
    <Provider store={createStore()}>
      <ChatPanel
        messages={[]}
        status="ready"
        isBusy={false}
        isCompacting={false}
        input=""
        onInputChange={() => {}}
        onSend={() => {}}
        onStop={() => {}}
        onSuggestion={() => {}}
        onNewChat={onNewChat}
        onClose={() => {}}
        history={[]}
        onSwitchChat={() => {}}
        onClearHistory={() => {}}
      />
    </Provider>
  );
  const trigger = screen.getByRole('button', { name: 'Assistant actions' });
  await user.click(trigger);
  const action = screen.getByRole('button', { name: 'New chat' });
  // The panel's layer is above the default body portal (1001). Its sibling host
  // also avoids the panel's overflow clipping and animation transform.
  const host = action.closest('[data-assistant-popover-host]');
  expect(host).toHaveClass('z-1100');
  expect(screen.getByRole('region', { name: 'Geo assistant' })).not.toContainElement(host as HTMLElement);
  await user.click(action);
  expect(onNewChat).toHaveBeenCalledOnce();
  expect(trigger).toHaveFocus();
});

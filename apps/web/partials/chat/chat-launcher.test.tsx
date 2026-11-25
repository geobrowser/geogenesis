import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TemplateShell } from '~/core/templates/primitives/template-shell';
import { LiveClaimTemplateView } from '~/core/templates/views/live-claim-template-view';

import { AssistantFab } from './assistant-fab';
import { ChatLauncher } from './chat-launcher';

const widget = vi.hoisted(() => vi.fn((_: { openOnMount?: string | null }) => <div data-testid="widget" />));

vi.mock('next/dynamic', () => ({ default: () => widget }));
// A claim page still loading: the live view draws its skeleton, not the template.
vi.mock('~/core/templates/adapters/use-live-claim-template', () => ({
  useLiveClaimTemplate: () => ({ data: null, isLoading: true, isSectionsLoading: true, actionCallbacks: {} }),
}));
vi.mock('~/partials/entity-page/entity-page-actions', () => ({ EntityPageActions: () => null }));
// Only the full-screen-route check is stubbed; the template-page check runs for real.
vi.mock('./assistant-visibility', async importOriginal => ({
  ...(await importOriginal<typeof import('./assistant-visibility')>()),
  useHideAssistant: () => false,
}));

describe('ChatLauncher', () => {
  afterEach(cleanup);

  it('renders only the button until it is pressed', () => {
    render(<ChatLauncher />);
    expect(screen.queryByTestId('widget')).toBeNull();
    fireEvent.click(screen.getByLabelText('Open assistant'));
    expect(screen.getByTestId('widget')).toBeTruthy();
    expect(widget.mock.calls.at(-1)?.[0].openOnMount).toBe('fab');
  });

  it('loads the widget on Cmd+K', () => {
    render(<ChatLauncher />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }));
    });
    expect(screen.getByTestId('widget')).toBeTruthy();
    expect(widget.mock.calls.at(-1)?.[0].openOnMount).toBe('keyboard_shortcut');
  });

  describe('on an entity page that uses a template (GEO-3846)', () => {
    const renderWith = (ui: React.ReactNode) => render(<Provider store={createStore()}>{ui}</Provider>);

    it('shows no floating button while a template page is on screen, and brings it back after', () => {
      const store = createStore();
      const { rerender } = render(
        <Provider store={store}>
          <TemplateShell>
            <h1>Gaza</h1>
          </TemplateShell>
          <ChatLauncher />
        </Provider>
      );
      expect(screen.getByRole('heading', { name: 'Gaza' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Open assistant')).toBeNull();

      // Leaving for a page without a template.
      rerender(
        <Provider store={store}>
          <ChatLauncher />
        </Provider>
      );
      expect(screen.getByLabelText('Open assistant')).toBeInTheDocument();
    });

    it('still shows the button on a page without a template', () => {
      renderWith(<ChatLauncher />);
      expect(screen.getByLabelText('Open assistant')).toBeInTheDocument();
    });

    it('still shows the button when a template is only in the side panel or a Space embed', () => {
      renderWith(
        <>
          <TemplateShell compact>
            <p>side panel</p>
          </TemplateShell>
          <TemplateShell embedded>
            <p>space embed</p>
          </TemplateShell>
          <ChatLauncher />
        </>
      );
      expect(screen.getByLabelText('Open assistant')).toBeInTheDocument();
    });

    it('still opens the panel from Cmd+K on a template page', () => {
      renderWith(
        <>
          <TemplateShell>
            <h1>Gaza</h1>
          </TemplateShell>
          <ChatLauncher />
        </>
      );
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }));
      });
      expect(screen.getByTestId('widget')).toBeInTheDocument();
    });

    it('shows no floating button while a template page is still loading', () => {
      renderWith(
        <>
          <LiveClaimTemplateView entityId="claim-1" spaceId="space-1" />
          <ChatLauncher />
        </>
      );
      expect(screen.queryByLabelText('Open assistant')).toBeNull();
    });

    it('still shows the button beside a loading template in the side panel', () => {
      renderWith(
        <>
          <LiveClaimTemplateView entityId="claim-1" spaceId="space-1" compact />
          <ChatLauncher />
        </>
      );
      expect(screen.getByLabelText('Open assistant')).toBeInTheDocument();
    });

    // The widget's own button, which takes over once the assistant has been opened and closed.
    it("keeps the widget's button off on a template page too", () => {
      const onOpen = vi.fn();
      const store = createStore();
      const { rerender } = render(
        <Provider store={store}>
          <TemplateShell>
            <h1>Gaza</h1>
          </TemplateShell>
          <AssistantFab animated onOpen={onOpen} />
        </Provider>
      );
      expect(screen.queryByLabelText('Open assistant')).toBeNull();

      rerender(
        <Provider store={store}>
          <AssistantFab animated onOpen={onOpen} />
        </Provider>
      );
      fireEvent.click(screen.getByLabelText('Open assistant'));
      expect(onOpen).toHaveBeenCalledOnce();
    });
  });
});

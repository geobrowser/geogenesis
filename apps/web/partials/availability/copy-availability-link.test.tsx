import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionContextProvider } from '~/core/action-context-provider';

import { Menu } from '~/design-system/menu';

import { AvailabilityModal } from './availability-modal';
import { CopyOwnAvailabilityLinkButton } from './copy-availability-link';
import { CopyAvailabilityLinkMenuItem } from './copy-availability-link-menu-item';

const { capture, revision } = vi.hoisted(() => ({ capture: vi.fn(), revision: { current: 0 } }));
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => revision.current }));

let flagOn = true;
let personalSpaceId: string | null = 'my-space';
const setToast = vi.fn();

vi.mock('~/core/state/feature-flags', () => ({ usePeerAvailabilityEnabled: () => flagOn }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => setToast }));

beforeAll(() => {
  // The menu's placement hook observes its trigger, and JSDOM has no ResizeObserver.
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  capture.mockReset();
  revision.current = 0;
  window.history.replaceState({}, '', '/explore');
  flagOn = true;
  personalSpaceId = 'my-space';
});

afterEach(() => {
  cleanup();
  setToast.mockClear();
  vi.restoreAllMocks();
});

describe('CopyOwnAvailabilityLinkButton', () => {
  it('copies a link to your own profile and confirms in place', async () => {
    const user = userEvent.setup();
    render(<CopyOwnAvailabilityLinkButton />);

    await user.click(screen.getByRole('button', { name: 'Copy availability link' }));

    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/space/my-space?modal=availability&via=share`);
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });

  it('draws nothing behind the flag or without a personal space', () => {
    flagOn = false;
    const { rerender } = render(<CopyOwnAvailabilityLinkButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    flagOn = true;
    personalSpaceId = null;
    rerender(<CopyOwnAvailabilityLinkButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('CopyAvailabilityLinkMenuItem', () => {
  it("copies the profile's link, whoever is looking, and closes the menu it sits in", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Menu open onOpenChange={onOpenChange} trigger={<span>More</span>}>
        <CopyAvailabilityLinkMenuItem profileSpaceId="their-space" />
      </Menu>
    );

    await user.click(screen.getByRole('button', { name: 'Copy availability link' }));

    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/space/their-space?modal=availability&via=share`);
    expect(setToast).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('draws nothing behind the flag', () => {
    flagOn = false;
    render(<CopyAvailabilityLinkMenuItem profileSpaceId="their-space" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

// Exercise the actual modal/menu portals and the shared clipboard operation. Neither
// caller sits inside an ActionSurface: attribution must come from its React scope.
describe.each(['schedule', 'menu'] as const)('%s share attribution', surface => {
  function control() {
    return surface === 'schedule' ? (
      <AvailabilityModal
        open
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        headerAction={<CopyOwnAvailabilityLinkButton />}
      />
    ) : (
      <Menu open onOpenChange={vi.fn()} trigger={<span>More</span>}>
        <CopyAvailabilityLinkMenuItem profileSpaceId="their-space" />
      </Menu>
    );
  }

  it.each(['succeeded', 'failed'] as const)('retains caller context through delayed clipboard %s', async outcome => {
    const user = userEvent.setup();
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
      () =>
        new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        })
    );
    const view = render(
      <ActionContextProvider
        value={{
          page_type: 'claim',
          page_entity_id: 'page-claim',
          page_entity_type: 'claim',
          overlay: 'entity_side_panel',
          overlay_entity_id: 'panel-claim',
          overlay_entity_type: 'claim',
          list_id: 'profile_activity',
          item_position: 7,
          target_id: 'parent-claim',
          target_type_ids: ['parent-type'],
          origin_entity_ids: ['parent-source'],
        }}
      >
        {control()}
      </ActionContextProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Copy availability link' }));
    const spaceId = surface === 'schedule' ? 'my-space' : 'their-space';
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/space/${spaceId}?modal=availability`);
    expect(capture).not.toHaveBeenCalled();

    // Navigation and caller unmount may happen before the clipboard promise settles.
    window.history.replaceState({}, '', '/search');
    view.unmount();
    await act(async () => {
      if (outcome === 'succeeded') resolve();
      else reject(new Error('Clipboard unavailable'));
    });
    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({
        action_kind: 'share',
        outcome: outcome === 'succeeded' ? 'succeeded' : 'unknown',
        component: 'share_dialog',
        target_type: 'space',
        target_id: spaceId,
        page_path: '/explore',
        page_type: 'claim',
        page_entity_id: 'page-claim',
        page_entity_type: 'claim',
        list_id: 'profile_activity',
        item_position: 7,
        overlay: surface === 'schedule' ? 'modal' : 'entity_side_panel',
        overlay_entity_id: surface === 'schedule' ? 'my-space' : 'panel-claim',
        overlay_entity_type: surface === 'schedule' ? 'space' : 'claim',
      })
    );
    const event = capture.mock.calls[0][1];
    expect(event).not.toHaveProperty('target_type_ids');
    expect(event).not.toHaveProperty('origin_entity_ids');
    expect(event).not.toHaveProperty('url');
  });

  it('suppresses completion after the actor changes while copying', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
      () =>
        new Promise<void>(yes => {
          resolve = yes;
        })
    );
    render(control());
    await user.click(screen.getByRole('button', { name: 'Copy availability link' }));
    revision.current++;
    await act(async () => resolve());
    expect(capture).not.toHaveBeenCalled();
  });
});

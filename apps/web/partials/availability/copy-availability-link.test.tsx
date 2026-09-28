import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyOwnAvailabilityLinkButton } from './copy-availability-link';
import { CopyAvailabilityLinkMenuItem } from './copy-availability-link-menu-item';

let flagOn = true;
let personalSpaceId: string | null = 'my-space';
const setToast = vi.fn();

vi.mock('~/core/state/feature-flags', () => ({ usePeerAvailabilityEnabled: () => flagOn }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => setToast }));

beforeEach(() => {
  flagOn = true;
  personalSpaceId = 'my-space';
});

afterEach(() => {
  cleanup();
  setToast.mockClear();
});

describe('CopyOwnAvailabilityLinkButton', () => {
  it('copies a link to your own profile and confirms in place', async () => {
    const user = userEvent.setup();
    render(<CopyOwnAvailabilityLinkButton />);

    await user.click(screen.getByRole('button', { name: 'Copy availability link' }));

    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/space/my-space?modal=availability&modalTarget=my-space`
    );
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
  it("copies the profile's link, whoever is looking", async () => {
    const user = userEvent.setup();
    render(<CopyAvailabilityLinkMenuItem profileSpaceId="their-space" />);

    await user.click(screen.getByRole('button', { name: 'Copy availability link' }));

    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/space/their-space?modal=availability&modalTarget=their-space`
    );
    expect(setToast).toHaveBeenCalledOnce();
  });

  it('draws nothing behind the flag', () => {
    flagOn = false;
    render(<CopyAvailabilityLinkMenuItem profileSpaceId="their-space" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

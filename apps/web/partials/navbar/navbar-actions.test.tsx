import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavbarActions } from './navbar-actions';

const address = '0x1234567890abcdef1234567890abcdef12345678';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  push: vi.fn(),
  openCreateSpaceDialog: vi.fn(),
  setEditable: vi.fn(),
  editable: false,
  canEdit: false,
  profile: {
    name: 'Max',
    avatarUrl: 'ipfs://avatar',
  } as { name: string | null; avatarUrl: string | null } | null,
  personalSpaceId: 'personal-space' as string | null,
  // `ModeToggle` renders only on a space page; null keeps it out of the other suites as before.
  spaceId: null as string | null,
  isMobileNavbar: false,
  isSmartAccountLoading: false,
  dialogMounts: 0,
  pendingPersonalSpace: { isPending: false, topicId: null as string | null },
  privyUser: {
    id: 'user-a',
    email: { address: 'max@example.com' },
    linkedAccounts: [],
  } as Record<string, unknown> | null,
}));

vi.mock('@geogenesis/auth', () => ({
  useLogout: () => ({ logout: mocks.logout }),
  usePrivy: () => ({ ready: true, authenticated: true, user: mocks.privyUser }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('jotai', () => ({ useAtomValue: () => '' }));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({
    smartAccount: { account: { address } },
    isLoading: mocks.isSmartAccountLoading,
  }),
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({
  useGeoProfile: () => ({ profile: mocks.profile, isLoading: false }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => mocks.pendingPersonalSpace,
  isPendingPersonalSpaceId: (spaceId: string | null | undefined) => spaceId?.startsWith('pending:') ?? false,
}));
vi.mock('~/core/state/feature-flags', () => ({}));
vi.mock('~/core/hooks/use-space-id', () => ({ useSpaceId: () => mocks.spaceId }));
vi.mock('~/core/hooks/use-access-control', () => ({
  useAccessControl: () => ({ canEdit: mocks.canEdit, isLoading: false }),
}));
vi.mock('~/core/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('~/core/state/editable-store', () => ({
  useEditable: () => ({ editable: mocks.editable, setEditable: mocks.setEditable }),
}));
vi.mock('~/core/id', () => ({ ID: { createEntityId: () => 'new-entity' } }));
vi.mock('~/partials/hints/edit-mode-toggle-tip', () => ({
  EditModeToggleTip: () => null,
  useEditModeToggleTip: () => ({ open: false, dismiss: vi.fn(), isActive: false }),
}));
vi.mock('~/partials/create-space/create-space-dialog', () => ({
  useOpenCreateSpaceDialog: () => mocks.openCreateSpaceDialog,
}));
vi.mock('~/partials/onboarding/dialog', () => ({ avatarAtom: {} }));
// The real dialog pulls in the whole publish chain (which needs an unmocked
// jotai). The navbar's job is only to mount it, so assert on that.
vi.mock('~/partials/profile/edit-profile-dialog', () => ({
  // Counts mounts, not renders. The dialog owns the publish state, so surviving a
  // navbar re-render is not enough — it has to be the *same* component instance.
  EditProfileDialog: ({ open }: { open: boolean }) => {
    React.useEffect(() => {
      mocks.dialogMounts += 1;
    }, []);
    return open ? <div data-testid="edit-profile-dialog" /> : null;
  },
}));
vi.mock('~/core/wallet', () => ({ GeoConnectButton: () => <button>Connect</button> }));
vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: ({ value }: { value: string }) => <img src={value} alt="" />,
}));
vi.mock('~/design-system/avatar', () => ({
  // The value goes in an attribute, not the text. A real `Avatar` renders an image; rendering it
  // as text made it part of the trigger's accessible name, so the button announced as "Open profile
  // menu 0x1234…" — a mock artefact that would have sent someone chasing the wrong thing.
  Avatar: ({ value }: { value: string }) => <div data-testid="fallback-avatar" data-value={value} />,
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('~/design-system/menu', () => ({
  Menu: ({
    trigger,
    children,
    open,
    onOpenChange,
    className,
    asChild = false,
  }: {
    trigger: React.ReactNode;
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    className?: string;
    asChild?: boolean;
  }) => (
    <div>
      {/* No `aria-label` here on purpose. The mock used to supply one, which meant the real
          trigger could go unnamed and this suite would never notice — the name has to come from
          the component. */}
      {asChild && React.isValidElement(trigger) ? (
        React.cloneElement(trigger as React.ReactElement<React.ComponentProps<'button'>>, {
          onClick: () => onOpenChange(!open),
        })
      ) : (
        <button onClick={() => onOpenChange(!open)}>{trigger}</button>
      )}
      {open && (
        <div data-testid="profile-menu" className={className}>
          {children}
        </div>
      )}
    </div>
  ),
}));

describe('NavbarActions profile menu', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mocks.logout.mockReset();
    mocks.push.mockReset();
    mocks.openCreateSpaceDialog.mockReset();
    mocks.setEditable.mockReset();
    mocks.editable = false;
    mocks.canEdit = false;
    mocks.profile = { name: 'Max', avatarUrl: 'ipfs://avatar' };
    mocks.personalSpaceId = 'personal-space';
    mocks.spaceId = null;
    mocks.isMobileNavbar = false;
    mocks.isSmartAccountLoading = false;
    mocks.dialogMounts = 0;
    mocks.pendingPersonalSpace = { isPending: false, topicId: null };
    mocks.privyUser = {
      id: 'user-a',
      email: { address: 'max@example.com' },
      linkedAccounts: [],
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: mocks.isMobileNavbar,
        media: '(max-width: 639px)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
  });

  it('renders the wider identity layout and personal-space link', async () => {
    const user = userEvent.setup();
    render(<NavbarActions />);

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

    // No mobile width override: a fixed 322 does not fit a 320px viewport once `Menu` takes its
    // 8px collision padding each side, and Radix repositions fixed-width content rather than
    // shrinking it. The base is viewport-calculated with 322 as a ceiling, which is what phones
    // want — so the assertion is that the override is gone.
    expect(screen.getByTestId('profile-menu')).toHaveClass('w-[calc(100vw-16px)]', 'max-w-[322px]');
    expect(screen.getByTestId('profile-menu').className).not.toContain('mobile:w-[322px]');
    const identityLink = screen.getByRole('link', { name: /Max max@example\.com/ });
    expect(identityLink).toHaveAttribute('href', '/space/personal-space');
    expect(identityLink).toHaveClass('gap-3', 'px-3', 'py-2.5');
    expect(identityLink.querySelector('.h-8.w-8')).toBeInTheDocument();
    expect(screen.getByText('Max')).toHaveClass(
      'font-[family-name:var(--font-calibre)]',
      'text-[1rem]',
      'leading-5',
      'font-medium',
      'tracking-[-0.03125rem]',
      'not-italic'
    );
    expect(screen.getByText('max@example.com')).toHaveClass(
      'font-[family-name:var(--font-calibre)]',
      'text-[1rem]',
      'leading-5',
      'font-medium',
      'tracking-[-0.03125rem]',
      'not-italic'
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveClass(
      'px-3',
      'py-2.5',
      'font-[family-name:var(--font-calibre)]',
      'text-[1rem]',
      'leading-[0.9375rem]',
      'font-medium',
      'tracking-[-0.03125rem]',
      'not-italic'
    );
    expect(screen.queryByText('Personal space')).not.toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('uses identity fallbacks and the pending personal-space destination', async () => {
    mocks.profile = { name: null, avatarUrl: null };
    mocks.personalSpaceId = null;
    mocks.pendingPersonalSpace = { isPending: true, topicId: 'topic-1' };
    mocks.privyUser = { id: 'user-a', linkedAccounts: [] };
    const user = userEvent.setup();
    render(<NavbarActions />);

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

    const identityLink = screen.getByRole('link', { name: /0x1234…5678/ });
    expect(identityLink).toHaveAttribute('href', '/space/pending/topic-1');
    expect(within(identityLink).getByText(address, { selector: 'p' })).toBeInTheDocument();
  });

  it('opens the edit profile modal from the menu, above the sign out divider', async () => {
    const user = userEvent.setup();
    render(<NavbarActions />);
    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

    // Nothing is mounted until it is asked for — a publish outlives the close,
    // so the dialog stays mounted from here on rather than being remounted.
    expect(screen.queryByTestId('edit-profile-dialog')).not.toBeInTheDocument();

    const editProfile = screen.getByRole('button', { name: 'Edit profile' });
    // Each of the three groups — identity, Edit profile, Sign out — is separated
    // by its own rule.
    expect(editProfile).toHaveClass('border-t', 'border-grey-02');
    expect(editProfile.compareDocumentPosition(screen.getByRole('button', { name: 'Sign out' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    await user.click(editProfile);

    expect(screen.getByTestId('edit-profile-dialog')).toBeInTheDocument();
    // Opening it closes the menu it was launched from.
    expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();
  });

  it('hides edit profile until a personal space exists to publish into', async () => {
    mocks.personalSpaceId = null;
    const user = userEvent.setup();
    render(<NavbarActions />);
    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
  });

  // A publish outlives the modal closing, and `isUserLoading` can flip back to true
  // mid-session — the smart-account query key includes the wallet address, so a tab
  // refocus re-resolves it. Unmounting the dialog there tears down the hook under an
  // in-flight write and strands its staged rows.
  it('keeps the edit profile dialog mounted while the account re-resolves', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NavbarActions />);
    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.getByTestId('edit-profile-dialog')).toBeInTheDocument();

    expect(mocks.dialogMounts).toBe(1);

    mocks.isSmartAccountLoading = true;
    rerender(<NavbarActions />);

    // Presence alone is not the guarantee — a remounted dialog is still in the DOM
    // but has lost the staged edit it was holding.
    expect(screen.getByTestId('edit-profile-dialog')).toBeInTheDocument();
    expect(mocks.dialogMounts).toBe(1);
  });

  it('leaves sign out working, and no longer offers a second availability switch', async () => {
    // The toggle moved to the debates hub panel, which the navbar's own hub button opens
    // from anywhere — a copy here was a second control for one setting.
    const user = userEvent.setup();
    render(<NavbarActions />);
    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

    expect(screen.queryByRole('switch', { name: 'Available to debate' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
  // This PR is what puts these on a phone, so they are the ones it has to make tappable. 28px and
  // ~34px are fine with a cursor and under every touch-target minimum — 44pt in Apple's guidance,
  // 48dp in Material. The rest of the navbar row was already on mobile and belongs to GEO-2970.
  //
  // Asserted on the class because jsdom does not evaluate media queries: a rendering test would
  // pass with the mobile sizing removed.
  describe('touch targets on mobile', () => {
    it('gives the profile trigger a thumb-sized area without resizing the avatar', async () => {
      mocks.profile = { name: 'Max', avatarUrl: null };
      render(<NavbarActions />);

      const avatar = await screen.findByTestId('fallback-avatar');
      expect(screen.getByRole('button', { name: 'Open profile menu' })).toHaveClass('p-0');

      // Both dimensions on the same ancestor. Height alone passed with `mobile:w-11` removed, which
      // leaves a 44px-tall sliver 28px wide — not the thumb-sized area the test claims.
      const tapArea = avatar.closest('[class*="mobile:h-11"]');
      expect(tapArea).not.toBeNull();
      expect(tapArea?.className ?? '').toContain('mobile:w-11');
      // The avatar itself is untouched — the area around it grew, not the picture.
      expect(avatar.closest('.h-7')).not.toBeNull();
    });

    it('reserves the loaded profile trigger footprint while the account is loading', () => {
      mocks.isMobileNavbar = true;
      mocks.isSmartAccountLoading = true;
      const { container } = render(<NavbarActions />);

      const profileSkeleton = container.querySelector('[class*="mobile:h-11"]');
      expect(profileSkeleton).not.toBeNull();
      expect(profileSkeleton?.className ?? '').toContain('mobile:w-11');
    });
  });

  // One stateful toggle instance supplies either slot. Rendering two independently would duplicate
  // its keyboard shortcut, access-control effect and analytics even if CSS hid one of them.
  describe('the edit mode toggle', () => {
    it('stays beside the avatar on desktop', async () => {
      mocks.spaceId = 'space-1';
      render(<NavbarActions />);

      const toggle = await screen.findByTestId('edit-toggle');

      expect(toggle).toHaveAccessibleName('Switch to edit mode');
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(toggle).toHaveAttribute('data-mode-toggle-placement', 'navbar');
      expect(toggle).toHaveClass('p-0');
      expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();
    });

    it('moves into the profile menu on mobile', async () => {
      mocks.spaceId = 'space-1';
      mocks.isMobileNavbar = true;
      const user = userEvent.setup();
      render(<NavbarActions />);

      // The menu content is unmounted while closed, and no second navbar copy exists.
      expect(screen.queryByTestId('edit-toggle')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

      const menu = screen.getByTestId('profile-menu');
      const toggle = within(menu).getByRole('switch', { name: 'Edit mode off' });
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      expect(toggle).not.toHaveAttribute('aria-pressed');
      expect(toggle).toHaveAttribute('data-mode-toggle-placement', 'profile-menu');
      expect(toggle).toHaveClass('w-full', 'border-t', 'py-2.5');
      expect(within(toggle).getByText('Edit mode off')).toBeInTheDocument();
      expect(within(toggle).getByTestId('edit-mode-switch-visual')).toHaveClass('h-2.5', 'w-4', 'rounded-full');
      expect(screen.getAllByTestId('edit-toggle')).toHaveLength(1);
    });

    it('turns edit mode on from the mobile switch', async () => {
      mocks.spaceId = 'space-1';
      mocks.isMobileNavbar = true;
      mocks.canEdit = true;
      const user = userEvent.setup();
      render(<NavbarActions />);

      await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
      await user.click(screen.getByRole('switch', { name: 'Edit mode off' }));

      expect(mocks.setEditable).toHaveBeenCalledWith(true);
    });

    it('orders the mobile menu actions and creates an entity in the current space', async () => {
      mocks.spaceId = 'space-1';
      mocks.isMobileNavbar = true;
      const user = userEvent.setup();
      render(<NavbarActions />);

      await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

      const editProfile = screen.getByRole('button', { name: 'Edit profile' });
      const editMode = screen.getByRole('switch', { name: 'Edit mode off' });
      const createEntity = screen.getByRole('button', { name: 'Create new entity' });
      const createProperty = screen.getByRole('button', { name: 'Create new property' });
      const createSpace = screen.getByRole('button', { name: 'Create new space' });
      const signOut = screen.getByRole('button', { name: 'Sign out' });

      expect(editProfile.compareDocumentPosition(editMode)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(editMode.compareDocumentPosition(createEntity)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(createEntity.compareDocumentPosition(createProperty)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(createProperty.compareDocumentPosition(createSpace)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(createSpace.compareDocumentPosition(signOut)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      await user.click(createEntity);

      expect(mocks.push).toHaveBeenCalledWith('/space/space-1/new-entity?edit=true');
      expect(screen.queryByTestId('profile-menu')).not.toBeInTheDocument();
    });

    it('keeps property and space creation reachable from the mobile menu', async () => {
      mocks.spaceId = 'space-1';
      mocks.isMobileNavbar = true;
      const user = userEvent.setup();
      render(<NavbarActions />);

      await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
      await user.click(screen.getByRole('button', { name: 'Create new property' }));

      expect(mocks.push).toHaveBeenCalledWith('/space/space-1/new-entity?edit=true&type=property');

      await user.click(screen.getByRole('button', { name: 'Open profile menu' }));
      await user.click(screen.getByRole('button', { name: 'Create new space' }));

      expect(mocks.openCreateSpaceDialog).toHaveBeenCalledWith();
    });

    it('does not build entity URLs from a pending personal-space sentinel', async () => {
      mocks.spaceId = 'pending:topic-1';
      mocks.isMobileNavbar = true;
      const user = userEvent.setup();
      render(<NavbarActions />);

      await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

      expect(screen.queryByRole('button', { name: 'Create new entity' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Create new property' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create new space' })).toBeInTheDocument();
    });
  });
});

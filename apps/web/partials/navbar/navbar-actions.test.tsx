import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavbarActions } from './navbar-actions';

const address = '0x1234567890abcdef1234567890abcdef12345678';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  profile: {
    name: 'Max',
    avatarUrl: 'ipfs://avatar',
  } as { name: string | null; avatarUrl: string | null } | null,
  personalSpaceId: 'personal-space' as string | null,
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

vi.mock('jotai', () => ({ useAtomValue: () => '' }));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address } }, isLoading: false }),
}));
vi.mock('~/core/hooks/use-geo-profile', () => ({
  useGeoProfile: () => ({ profile: mocks.profile, isLoading: false }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => mocks.pendingPersonalSpace,
}));
vi.mock('~/core/state/feature-flags', () => ({
}));
vi.mock('~/core/hooks/use-space-id', () => ({ useSpaceId: () => null }));
vi.mock('~/core/hooks/use-access-control', () => ({
  useAccessControl: () => ({ canEdit: false, isLoading: false }),
}));
vi.mock('~/core/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('~/core/state/editable-store', () => ({
  useEditable: () => ({ editable: false, setEditable: vi.fn() }),
}));
vi.mock('~/partials/hints/edit-mode-toggle-tip', () => ({
  EditModeToggleTip: () => null,
  useEditModeToggleTip: () => ({ open: false, dismiss: vi.fn(), isActive: false }),
}));
vi.mock('~/partials/onboarding/dialog', () => ({ avatarAtom: {} }));
vi.mock('~/core/wallet', () => ({ GeoConnectButton: () => <button>Connect</button> }));
vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: ({ value }: { value: string }) => <img src={value} alt="" />,
}));
vi.mock('~/design-system/avatar', () => ({
  Avatar: ({ value }: { value: string }) => <div data-testid="fallback-avatar">{value}</div>,
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
  }: {
    trigger: React.ReactNode;
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    className?: string;
  }) => (
    <div>
      <button aria-label="Open profile menu" onClick={() => onOpenChange(!open)}>
        {trigger}
      </button>
      {open && (
        <div data-testid="profile-menu" className={className}>
          {children}
        </div>
      )}
    </div>
  ),
}));

describe('NavbarActions profile menu', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.logout.mockReset();
    mocks.profile = { name: 'Max', avatarUrl: 'ipfs://avatar' };
    mocks.personalSpaceId = 'personal-space';
    mocks.pendingPersonalSpace = { isPending: false, topicId: null };
    mocks.privyUser = {
      id: 'user-a',
      email: { address: 'max@example.com' },
      linkedAccounts: [],
    };
  });

  it('renders the wider identity layout and personal-space link', async () => {
    const user = userEvent.setup();
    render(<NavbarActions />);

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }));

    expect(screen.getByTestId('profile-menu')).toHaveClass('sm:w-[322px]');
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
});

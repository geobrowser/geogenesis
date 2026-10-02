import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentRole } from '~/core/profile/profile-summary';

import { ProfileHeadline } from './profile-headline';

vi.mock('./profile-entity-link', () => ({
  ProfileEntityLink: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));

vi.mock('./organization-image', () => ({
  OrganizationImage: ({ url }: { url: string | null }) => <span data-testid="org-logo" data-url={url ?? ''} />,
}));

const SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';

function role(overrides: Partial<CurrentRole>): CurrentRole {
  return {
    kind: 'employment',
    subject: 'Director for Intergovermental Affairs',
    subjectId: 'role-1',
    organization: 'DMUN Foundation',
    organizationId: 'org-1',
    avatarUrl: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('ProfileHeadline', () => {
  it('draws no logo, placeholder or otherwise, for an organisation without one', () => {
    render(<ProfileHeadline roles={[role({})]} spaceId={SPACE} />);

    expect(screen.queryByTestId('org-logo')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('Director for Intergovermental Affairs at DMUN Foundation');
  });

  it('draws the logo for an organisation that has one', () => {
    render(<ProfileHeadline roles={[role({ avatarUrl: 'ipfs://logo' })]} spaceId={SPACE} />);

    expect(screen.getByTestId('org-logo')).toHaveAttribute('data-url', 'ipfs://logo');
  });

  it('keeps the logo on the same line as the first word of the name', () => {
    render(
      <ProfileHeadline
        roles={[role({ organization: 'UN Major Group for Children and Youth', avatarUrl: 'ipfs://logo' })]}
        spaceId={SPACE}
      />
    );

    const unbreakable = screen.getByTestId('org-logo').closest('.whitespace-nowrap');
    expect(unbreakable).toHaveTextContent(/^UN$/);
  });
});

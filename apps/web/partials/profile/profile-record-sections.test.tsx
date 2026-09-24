import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmploymentCard } from '~/core/profile/normalize-history';

import { ProfileRecordSection, ProfileSkillsSection } from './profile-record-sections';

const mocks = vi.hoisted(() => ({
  /** Every (entityId, spaceId) a name on this card was made to open. */
  links: [] as { entityId: string; spaceId: string }[],
}));

vi.mock('./profile-entity-link', () => ({
  ProfileEntityLink: ({
    entityId,
    spaceId,
    children,
    className,
  }: {
    entityId: string;
    spaceId: string;
    children: React.ReactNode;
    className?: string;
  }) => {
    mocks.links.push({ entityId, spaceId });
    return (
      <a href={`/space/${spaceId}/${entityId}`} className={className}>
        {children}
      </a>
    );
  },
}));

const SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';

const NOTHING = { relations: [], values: [] };

function card(org: string, role: string, skills: string[] = []): EmploymentCard {
  const edge = { relationId: `edge-${org}`, stintId: `stint-${org}`, spaceId: null, subtree: NOTHING };

  return {
    organization: { id: `org-${org}`, name: org },
    avatarUrl: null,
    edges: [edge],
    entries: [
      {
        relationId: `rel-${role}`,
        spaceId: null,
        tenureId: `tenure-${role}`,
        edge,
        subtree: NOTHING,
        subject: { id: `title-${role}`, name: role },
        startDate: '2022-06-01Z',
        endDate: null,
        description: null,
        isLegacy: false,
        status: 'current',
        employmentType: null,
        skills: skills.map(name => ({ id: `skill-${name}`, name })),
        location: null,
        locationType: null,
      },
    ],
  } as unknown as EmploymentCard;
}

describe('ProfileRecordSection', () => {
  beforeEach(() => {
    mocks.links = [];
  });

  afterEach(cleanup);

  it('opens the company and the role, not just the company', () => {
    render(
      <ProfileRecordSection
        kind="employment"
        cards={[card('Geo', 'Head of Product')]}
        isOwner={false}
        onEdit={() => {}}
        spaceId={SPACE}
      />
    );

    expect(mocks.links).toEqual(
      expect.arrayContaining([
        { entityId: 'org-Geo', spaceId: SPACE },
        { entityId: 'title-Head of Product', spaceId: SPACE },
      ])
    );
  });

  it('opens each skill on a role', () => {
    render(
      <ProfileRecordSection
        kind="employment"
        cards={[card('Geo', 'Analyst', ['Market research'])]}
        isOwner={false}
        onEdit={() => {}}
        spaceId={SPACE}
      />
    );

    expect(mocks.links).toContainEqual({ entityId: 'skill-Market research', spaceId: SPACE });
  });

  it('offers the owner an edit control, not an add-only one', () => {
    const onEdit = vi.fn();

    render(
      <ProfileRecordSection
        kind="employment"
        cards={[card('Geo', 'Analyst')]}
        isOwner
        onEdit={onEdit}
        spaceId={SPACE}
      />
    );

    // Named for what it opens: a `+` promised only half of what the section
    // needs, and deleting a role meant leaving the page for the Edit profile
    // modal.
    fireEvent.click(screen.getByRole('button', { name: 'Edit experience' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('shows a visitor nothing where the section is empty', () => {
    const { container } = render(
      <ProfileRecordSection kind="employment" cards={[]} isOwner={false} onEdit={() => {}} spaceId={SPACE} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('reserves the section for a visitor while the history is still on the way', () => {
    // Nothing at all and then a section pushed the whole page down when the read
    // landed — the largest single layout shift on a profile after the headline.
    render(
      <ProfileRecordSection kind="employment" cards={[]} isOwner={false} onEdit={() => {}} spaceId={SPACE} isLoading />
    );

    expect(screen.getByRole('heading', { name: 'Experience' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /appears on your profile/ })).not.toBeInTheDocument();
  });

  it('does not invite the owner to add a role that may already be there', () => {
    render(<ProfileRecordSection kind="employment" cards={[]} isOwner onEdit={() => {}} spaceId={SPACE} isLoading />);

    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });

  it('draws the real section as soon as it has cards, loading or not', () => {
    // A refetch keeps `isLoading` false, but a background poll must never
    // replace cards already on screen with a placeholder.
    render(
      <ProfileRecordSection
        kind="employment"
        cards={[card('Geo', 'Head of Product')]}
        isOwner={false}
        onEdit={() => {}}
        spaceId={SPACE}
        isLoading
      />
    );

    expect(screen.getByRole('link', { name: 'Head of Product' })).toBeInTheDocument();
  });
});

describe('ProfileSkillsSection', () => {
  beforeEach(() => {
    mocks.links = [];
  });

  afterEach(cleanup);

  const many = Array.from({ length: 10 }, (_, i) => ({ id: `skill-${i}`, name: `Skill ${i}` }));

  it('keeps the show-more control inside the chip container', () => {
    const { container } = render(<ProfileSkillsSection skills={many} spaceId={SPACE} />);

    const toggle = screen.getByRole('button', { name: '+2 more' });
    const chipContainer = container.querySelector('ul');

    // Below the box it reads as a control over the section, which is a larger
    // promise than "show the rest of these".
    expect(chipContainer).not.toBeNull();
    expect(chipContainer?.contains(toggle)).toBe(true);
  });

  it('shows every skill once expanded, and offers its way back', () => {
    render(<ProfileSkillsSection skills={many} spaceId={SPACE} />);

    fireEvent.click(screen.getByRole('button', { name: '+2 more' }));

    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
    expect(screen.getByText('Skill 9')).toBeInTheDocument();
  });

  it('opens each skill', () => {
    render(<ProfileSkillsSection skills={[{ id: 'skill-finance', name: 'Finance' }]} spaceId={SPACE} />);

    expect(mocks.links).toContainEqual({ entityId: 'skill-finance', spaceId: SPACE });
  });

  it('renders nothing when there are no skills, for the owner too', () => {
    // Unlike Experience and Education. Those are authored, so an empty one is a
    // thing to do; skills are derived off the roles above, and there is nothing
    // to add here that is not added there.
    const { container } = render(<ProfileSkillsSection skills={[]} spaceId={SPACE} />);

    expect(container).toBeEmptyDOMElement();
  });
});

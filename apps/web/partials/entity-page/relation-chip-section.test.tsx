import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { RelationChipSection } from './relation-chip-section';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function relation(id: string, name: string | null): Relation {
  return { id, toEntity: { id: `${id}-entity`, name } } as unknown as Relation;
}

function relations(count: number): Relation[] {
  return Array.from({ length: count }, (_, index) => relation(`relation-${index}`, `Topic ${index}`));
}

afterEach(cleanup);

describe('RelationChipSection', () => {
  it('names the section and its heading with the label it is given', () => {
    render(<RelationChipSection label="Topics" relations={relations(2)} spaceId="space-1" />);

    expect(screen.getByRole('region', { name: 'Topics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Topics' })).toBeInTheDocument();
  });

  it('links each chip to its entity in the space it was given', () => {
    render(<RelationChipSection label="Topics" relations={[relation('a', 'Ethics')]} spaceId="space-1" />);

    expect(screen.getByRole('link', { name: 'Ethics' })).toHaveAttribute(
      'href',
      NavUtils.toEntity('space-1', 'a-entity')
    );
  });

  // An unnamed relation still has to be reachable; the id says less than a name but more than a gap.
  it('falls back to the entity id when a relation has no name', () => {
    render(<RelationChipSection label="Topics" relations={[relation('a', null)]} spaceId="space-1" />);

    expect(screen.getByRole('link', { name: 'a-entity' })).toBeInTheDocument();
  });

  it('renders nothing at all when there are no relations', () => {
    const { container } = render(<RelationChipSection label="Topics" relations={[]} spaceId="space-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('the +N expander', () => {
    it('stays out of the way while everything fits', () => {
      render(<RelationChipSection label="Topics" relations={relations(8)} spaceId="space-1" />);

      expect(screen.getAllByRole('link')).toHaveLength(8);
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('counts what it is hiding', () => {
      render(<RelationChipSection label="Topics" relations={relations(11)} spaceId="space-1" />);

      expect(screen.getAllByRole('link')).toHaveLength(8);
      expect(screen.getByRole('button', { name: '+3' })).toBeInTheDocument();
    });

    it('marks itself as collapsed while it is hiding something', () => {
      render(<RelationChipSection label="Topics" relations={relations(11)} spaceId="space-1" />);

      expect(screen.getByRole('button', { name: '+3' })).toHaveAttribute('aria-expanded', 'false');
    });

    // The button reveals everything and so removes itself, which leaves focus on a detached
    // element and drops it to `<body>`. A keyboard viewer would have to tab from the top of the
    // page to reach the chips they just asked to see.
    it('moves focus to the first revealed chip rather than losing it', () => {
      render(<RelationChipSection label="Topics" relations={relations(11)} spaceId="space-1" />);

      fireEvent.click(screen.getByRole('button', { name: '+3' }));

      expect(screen.getByRole('link', { name: 'Topic 8' })).toHaveFocus();
    });

    // Expands in place rather than linking away — the section exists to be scanned without
    // leaving the page.
    it('reveals the rest in place and then has nothing left to offer', () => {
      render(<RelationChipSection label="Topics" relations={relations(11)} spaceId="space-1" />);

      fireEvent.click(screen.getByRole('button', { name: '+3' }));

      expect(screen.getAllByRole('link')).toHaveLength(11);
      expect(screen.queryByRole('button')).toBeNull();
    });
  });
});

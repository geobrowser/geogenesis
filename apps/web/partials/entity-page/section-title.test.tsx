import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { textStyles } from '~/design-system/theme/typography';

import { SectionTitle } from './section-title';

afterEach(cleanup);

describe('SectionTitle', () => {
  it('renders a heading, so the sections sit under the page title in the outline', () => {
    render(<SectionTitle>Related claims</SectionTitle>);

    expect(screen.getByRole('heading', { level: 2, name: 'Related claims' })).toBeInTheDocument();
  });

  // The size the comments section uses, which is what every other section is matched to. Asserted
  // through the typography table rather than against a literal class, so renaming the token moves
  // this with it instead of leaving a test that passes on a class nobody emits any more.
  it('uses the same type token as the comments heading', () => {
    render(<SectionTitle>Related claims</SectionTitle>);

    expect(screen.getByRole('heading', { name: 'Related claims' })).toHaveClass(textStyles.mediumTitle);
  });

  it('keeps its own spacing while allowing a caller to add to it', () => {
    render(<SectionTitle className="mt-4">Related claims</SectionTitle>);

    const heading = screen.getByRole('heading', { name: 'Related claims' });
    expect(heading).toHaveClass('mb-3');
    expect(heading).toHaveClass('mt-4');
  });
});

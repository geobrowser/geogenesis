import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { OnlineDot } from './online-dot';

afterEach(cleanup);

describe('OnlineDot', () => {
  it('is the design’s green', () => {
    const { container } = render(<OnlineDot />);

    // `bg-green` is `#2ACE9D`, the Figma card's colour — named rather than inlined so the token
    // stays the one place it is defined.
    expect(container.firstChild).toHaveClass('bg-green');
  });

  it('rings itself in white unless told otherwise', () => {
    const { container } = render(<OnlineDot />);

    expect(container.firstChild).toHaveClass('border-white');
  });

  it('takes the ring colour of whatever it is standing on', () => {
    const { container } = render(<OnlineDot ringClassName="border-grey-01" />);

    // The dot sits on the rim of a face, so the ring has to be the surface behind it — on a held
    // pill that is grey, not white. Getting this wrong is not subtle: the green runs straight into
    // whatever the avatar happens to show at that corner.
    expect(container.firstChild).toHaveClass('border-grey-01');
    expect(container.firstChild).not.toHaveClass('border-white');
  });

  it('keeps the ring outside the dot, so the green has somewhere to paint', () => {
    const { container } = render(<OnlineDot />);

    // The bug this pins shipped once and showed nothing at all: preflight makes everything
    // `border-box`, so 4px of box with a 2px border each side leaves a zero-width content box. The
    // ring paints, the green has no area, and the dot renders as a disc in the colour of whatever
    // is already behind it — invisible on every avatar, with no error anywhere.
    expect(container.firstChild).toHaveClass('box-content');
  });

  it('is hidden from assistive tech', () => {
    const { container } = render(<OnlineDot />);

    // Decoration beside a face that is itself `aria-hidden` in these stacks; presence is not
    // something a screen reader should hear as an unnamed graphic.
    expect(container.firstChild).toHaveAttribute('aria-hidden');
  });
});

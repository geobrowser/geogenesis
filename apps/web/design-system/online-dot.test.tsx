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

  describe('scales to the face it sits on', () => {
    // The proportions, not the pixels: green is a quarter of the face, the ring half the green.
    // The People tab's 32px faces wore the 16px face's dot, which read as a speck.
    it.each([
      [16, '4px', '2px', 'translate(-2px, -2px)'],
      [32, '8px', '4px', 'translate(-4px, -4px)'],
    ])('on a %ipx face', (faceSize, green, ring, offset) => {
      const { container } = render(<OnlineDot faceSize={faceSize} />);
      const dot = container.firstChild as HTMLElement;

      expect(dot.style.width).toBe(green);
      expect(dot.style.height).toBe(green);
      expect(dot.style.borderWidth).toBe(ring);
      // The green body sits on the face's corner and the ring bleeds outside, so the element starts
      // one ring-width up and left — which is what makes the avatar read as notched, not badged.
      expect(dot.style.transform).toBe(offset);
    });

    it('draws the claim pills’ face without being told', () => {
      const { container } = render(<OnlineDot />);

      expect((container.firstChild as HTMLElement).style.width).toBe('4px');
    });

    // Sized inline rather than through Tailwind: a class name computed from a prop is one the
    // compiler never sees, so it would ship without the rule that sizes it.
    it('carries its size as style rather than a computed class', () => {
      const { container } = render(<OnlineDot faceSize={32} />);

      expect((container.firstChild as HTMLElement).className).not.toMatch(/size-|border-\d/);
    });
  });

  it('is hidden from assistive tech', () => {
    const { container } = render(<OnlineDot />);

    // Decoration beside a face that is itself `aria-hidden` in these stacks; presence is not
    // something a screen reader should hear as an unnamed graphic.
    expect(container.firstChild).toHaveAttribute('aria-hidden');
  });
});

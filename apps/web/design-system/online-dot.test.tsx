import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { OnlineDot } from './online-dot';

afterEach(cleanup);

// The claim pills' face, and the size this geometry was drawn at. Named so the tests that are not
// about size do not each pick a number.
const FACE = 16;

describe('OnlineDot', () => {
  it('is the design’s green', () => {
    const { container } = render(<OnlineDot faceSize={FACE} />);

    // `bg-green` is `#2ACE9D`, the Figma card's colour — named rather than inlined so the token
    // stays the one place it is defined.
    expect(container.firstChild).toHaveClass('bg-green');
  });

  it('rings itself in white unless told otherwise', () => {
    const { container } = render(<OnlineDot faceSize={FACE} />);

    expect(container.firstChild).toHaveClass('border-white');
  });

  it('takes the ring colour of whatever it is standing on', () => {
    const { container } = render(<OnlineDot faceSize={FACE} ringClassName="border-grey-01" />);

    // The dot sits on the rim of a face, so the ring has to be the surface behind it — on a held
    // pill that is grey, not white. Getting this wrong is not subtle: the green runs straight into
    // whatever the avatar happens to show at that corner.
    expect(container.firstChild).toHaveClass('border-grey-01');
    expect(container.firstChild).not.toHaveClass('border-white');
  });

  it('keeps the ring outside the dot, so the green has somewhere to paint', () => {
    const { container } = render(<OnlineDot faceSize={FACE} />);

    // The bug this pins shipped once and showed nothing at all: preflight makes everything
    // `border-box`, so 4px of box with a 2px border each side leaves a zero-width content box. The
    // ring paints, the green has no area, and the dot renders as a disc in the colour of whatever
    // is already behind it — invisible on every avatar, with no error anywhere.
    expect(container.firstChild).toHaveClass('box-content');
  });

  // The proportions, not the pixels: green is a quarter of the face, the ring half the green. The
  // People tab's 32px faces wore the 16px face's dot, which read as a speck. Asserted as style
  // rather than class on purpose — a size computed into a class name is one the compiler never
  // sees, so these reads are also what would fail if the sizing moved back into Tailwind.
  it.each([
    [16, '4px', '2px', 'translate(-2px, -2px)'],
    [32, '8px', '4px', 'translate(-4px, -4px)'],
  ])('scales to the %ipx face it sits on', (faceSize, green, ring, offset) => {
    const { container } = render(<OnlineDot faceSize={faceSize} />);

    expect(container.firstChild).toHaveStyle({
      width: green,
      height: green,
      borderWidth: ring,
      // The green body sits on the face's corner and the ring bleeds outside, so the element starts
      // one ring-width up and left — which is what makes the avatar read as notched, not badged.
      transform: offset,
    });
  });

  it('is hidden from assistive tech', () => {
    const { container } = render(<OnlineDot faceSize={FACE} />);

    // Decoration beside a face that is itself `aria-hidden` in these stacks; presence is not
    // something a screen reader should hear as an unnamed graphic.
    expect(container.firstChild).toHaveAttribute('aria-hidden');
  });
});

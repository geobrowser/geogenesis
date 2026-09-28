import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { GeoLogoLarge } from './geo-logo-large';

describe('GeoLogoLarge', () => {
  afterEach(cleanup);

  it('uses a unique gradient when more than one logo is mounted', () => {
    const { container } = render(
      <>
        <GeoLogoLarge />
        <GeoLogoLarge />
      </>
    );

    const gradientIds = Array.from(container.querySelectorAll('radialGradient'), gradient => gradient.id);
    const circleStrokes = Array.from(container.querySelectorAll('circle'), circle => circle.getAttribute('stroke'));

    expect(new Set(gradientIds).size).toBe(2);
    expect(circleStrokes).toEqual(gradientIds.map(id => `url(#${id})`));
  });
});

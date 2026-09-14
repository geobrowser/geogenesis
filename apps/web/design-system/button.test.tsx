import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { AddTypeButton, Button, IconButton, SmallButton, SquareButton } from './button';
import { TextButton } from './text-button';

afterEach(cleanup);

/**
 * HTML defaults a bare button to `submit`, so every one of these inside a form
 * used to submit it — a Back button that published the profile, a remove-row
 * button that published before removing.
 */
describe('button type', () => {
  it.each([
    ['Button', <Button key="b">Go</Button>],
    ['SmallButton', <SmallButton key="s">Go</SmallButton>],
    ['SquareButton', <SquareButton key="q" aria-label="Go" />],
    ['IconButton', <IconButton key="i" aria-label="Go" icon={null} />],
    ['AddTypeButton', <AddTypeButton key="a" aria-label="Go" icon={null} label="Go" />],
    ['TextButton', <TextButton key="t">Go</TextButton>],
  ])('%s does not submit a form it happens to sit in', (_name, element) => {
    render(element);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('still lets a caller ask for submit', () => {
    render(<Button type="submit">Save</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});

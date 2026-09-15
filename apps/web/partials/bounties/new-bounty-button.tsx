'use client';

import * as React from 'react';

import { useEditableBountySpaces } from '~/core/bounties/use-editable-bounty-spaces';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { Menu, MenuItem } from '~/design-system/menu';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

/**
 * "New bounty" on the global bounties page. Bounties are created inside a
 * space, so: hidden unless the viewer edits at least one participating
 * space; a direct link when it is exactly one; a space picker when several.
 */
export function NewBountyButton() {
  const { data: spaces = [] } = useEditableBountySpaces();
  const [open, setOpen] = React.useState(false);

  if (spaces.length === 0) return null;

  if (spaces.length === 1) {
    return (
      <Link href={NavUtils.toNewBounty(spaces[0].id)} data-testid="new-bounty-button">
        <Button variant="primary">New bounty</Button>
      </Link>
    );
  }

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      trigger={
        <Button variant="primary" data-testid="new-bounty-button">
          New bounty
        </Button>
      }
    >
      {spaces.map(space => (
        <MenuItem key={space.id} href={NavUtils.toNewBounty(space.id)}>
          {space.name}
        </MenuItem>
      ))}
    </Menu>
  );
}

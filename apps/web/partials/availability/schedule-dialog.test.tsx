import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScheduleDialog } from './schedule-dialog';

afterEach(cleanup);

describe('ScheduleDialog', () => {
  it('announces its description line as the dialog’s description', () => {
    render(
      <ScheduleDialog open onOpenChange={vi.fn()} title="New match" description="Both debaters get an invite.">
        <p>Body</p>
      </ScheduleDialog>
    );

    expect(screen.getByRole('dialog', { name: 'New match' })).toHaveAccessibleDescription(
      'Both debaters get an invite.'
    );
  });

  it('points at no description when it has none', () => {
    render(
      <ScheduleDialog open onOpenChange={vi.fn()} title="Set your debate schedule">
        <p>Body</p>
      </ScheduleDialog>
    );

    expect(screen.getByRole('dialog', { name: 'Set your debate schedule' })).not.toHaveAttribute('aria-describedby');
  });
});

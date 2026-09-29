'use client';

import * as React from 'react';

import cx from 'classnames';

import { useNotificationPreferences, useSetEmailNotifications } from '~/core/notifications/hooks';

import { Toggle } from '~/design-system/toggle';

/**
 * "Email notifications" in the account menu (GEO-3029): the one switch every email we send has to be
 * able to point at. A per-category page is a later piece (GEO-2998); a dropdown is the wrong place for
 * a dozen switches.
 *
 * Render only when geo-notifications is configured and the person has a personal space: without one
 * there is no identity to register, and so nothing to switch.
 */
export function EmailNotificationsMenuItem({ className }: { className?: string }) {
  const { registration, preferences } = useNotificationPreferences();
  const setEmail = useSetEmailNotifications();

  const unavailable = registration.isError || preferences.isError;
  const noEmail = registration.isSuccess && !registration.data.email;
  const loading = !unavailable && !noEmail && preferences.data === undefined;
  const checked = preferences.data?.email_enabled ?? false;
  const disabled = unavailable || noEmail || loading || setEmail.isPending;

  const hint = unavailable
    ? 'Unavailable right now'
    : noEmail
      ? 'No email on your account'
      : setEmail.isError
        ? "Couldn't save. Try again."
        : null;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading || setEmail.isPending}
      disabled={disabled}
      // Stays open on purpose: this is a setting, and closing the menu would hide whether it took.
      onClick={() => setEmail.mutate(!checked)}
      className={cx(className, 'justify-between gap-3 disabled:cursor-default')}
    >
      <span className="flex flex-col items-start gap-0.5">
        <span>Email notifications</span>
        {hint && <span className="text-footnote text-grey-04">{hint}</span>}
      </span>
      <Toggle checked={checked} className={cx(disabled && 'opacity-40')} aria-hidden />
    </button>
  );
}

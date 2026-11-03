'use client';

import * as React from 'react';

import cx from 'classnames';

import { emailSettingsSummary, shownEmailGroups } from '~/core/notifications/email-groups';
import { useNotificationPreferences } from '~/core/notifications/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { ChevronRight } from '~/design-system/icons/chevron-right';

/**
 * "Email settings" in the account menu (GEO-3392): says how many email groups are on and opens the
 * settings dialog. It replaced the single "Email notifications" switch (GEO-3029) once there were
 * groups to choose between; a dropdown is the wrong place for six switches.
 *
 * Render only when geo-notifications is configured and the person has a personal space: without one
 * there is no identity to register, and so nothing to set.
 */
export function EmailSettingsMenuItem({ className, onOpen }: { className?: string; onOpen: () => void }) {
  const { registration, preferences } = useNotificationPreferences();
  const shown = shownEmailGroups(useFeatureFlag('spaceCalls'));

  const unavailable = registration.isError || preferences.isError;
  const noEmail = registration.isSuccess && !registration.data.email;
  const data = preferences.data;

  const hint = unavailable ? 'Unavailable right now' : noEmail ? 'No email on your account' : null;
  const summary = !hint && data ? emailSettingsSummary(data.email_enabled, data.email_groups, shown) : null;

  return (
    <button
      type="button"
      data-geo-analytics-label="Profile menu email settings"
      data-geo-analytics-intent="open_email_settings"
      onClick={onOpen}
      className={cx(className, 'justify-between gap-3')}
    >
      <span className="flex flex-col items-start gap-0.5">
        <span>Email settings</span>
        {hint && <span className="text-footnote text-grey-04">{hint}</span>}
      </span>
      <span className="flex items-center gap-1.5 text-metadata font-normal text-grey-04">
        {summary}
        <ChevronRight />
      </span>
    </button>
  );
}

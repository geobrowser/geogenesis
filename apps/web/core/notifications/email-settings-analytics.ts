import { capture } from '~/core/analytics';

import type { EmailGroup } from './email-groups';

/**
 * Email settings analytics (GEO-3392): how people reach the settings, and every switch they change,
 * split by group and on/off. Registered in geobrowser/analytics#129.
 */

/** Where the dialog was opened from: the account menu, or a `?modal=email-settings` link (an email's footer). */
export type EmailSettingsEntry = 'account_menu' | 'link';

export function emailSettingsOpened(entry: EmailSettingsEntry, via: string | null = null) {
  capture('email_settings_opened', { entry, ...(via ? { via } : {}) });
}

/**
 * A switch that saved. `all` is the all-email switch. `surface` says whether it was changed in the
 * settings dialog or on an email's unsubscribe page, where `undo` marks the Undo button.
 */
export function emailPreferenceChanged(change: {
  group: 'all' | EmailGroup;
  enabled: boolean;
  surface: 'settings' | 'unsubscribe_page';
  undo?: boolean;
}) {
  capture('email_preference_changed', {
    group: change.group,
    enabled: change.enabled,
    surface: change.surface,
    ...(change.undo ? { undo: true } : {}),
  });
}

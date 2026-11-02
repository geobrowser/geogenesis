import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';

/** `?modal=email-settings` on any page opens the viewer's email settings: every email's footer links here. */
export const EMAIL_SETTINGS_MODAL = DEEP_LINK_MODALS.emailSettings;

/**
 * A link that opens email settings (GEO-3392). On `/explore` by default, not `/`: `/` is the marketing
 * site, which can't open the app's dialog (the footers' `/?modal=email-settings` is redirected in
 * `next.config.ts`).
 */
export function toEmailSettings(pathname = '/explore', via?: string): string {
  return toModal({ modal: EMAIL_SETTINGS_MODAL, pathname, via });
}

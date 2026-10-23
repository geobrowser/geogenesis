import { redirect } from 'next/navigation';

import { toEmailSettings } from '~/core/notifications/email-settings-link';

/**
 * The proposal emails' footer still links here (geo-notifications `buildUnsubscribeUrls`), a page
 * that never existed. Email settings is a dialog on any page now (GEO-3392), so this hands over to it.
 * A `space` param is dropped: proposal emails are set in each space's settings.
 */
export default function Page() {
  redirect(toEmailSettings());
}

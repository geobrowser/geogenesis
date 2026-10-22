import { redirect } from 'next/navigation';

import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';

/**
 * The proposal emails' footer still links here (geo-notifications `buildUnsubscribeUrls`), a page
 * that never existed. Email settings is a dialog on any page now (GEO-3392), so this hands over to it.
 * A `space` param is dropped: proposal emails are set in each space's settings.
 */
export default function Page() {
  redirect(toModal({ modal: DEEP_LINK_MODALS.emailSettings, pathname: '/explore' }));
}

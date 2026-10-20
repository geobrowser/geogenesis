import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';

/** `?modal=schedule` on any page opens the viewer's own schedule editor. */
export const OWN_SCHEDULE_MODAL = DEEP_LINK_MODALS.schedule;

/** `href` with the editor's trigger added, absolute: geo-chat redirects here after Google. */
export function toOwnSchedule(href: string): string {
  const url = new URL(href);
  return new URL(
    toModal({ modal: OWN_SCHEDULE_MODAL, pathname: `${url.pathname}${url.search}${url.hash}` }),
    url.origin
  ).toString();
}

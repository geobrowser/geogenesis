import cx from 'classnames';

import { hubPillClassName } from '~/core/debates/matchmaking/hub-pill-button';

/**
 * The debate pill, as the profile modals use it, with a keyboard focus ring.
 *
 * The pill has no focus style of its own, and the app's base styles drop the
 * browser's outline on every focused button. The design-system `Button` these
 * replaced drew one, so without this the modals' Cancel and Save lost the only
 * sign of where keyboard focus was. An outline rather than a border, so it
 * reads on the black pill as well as the white one.
 */
export function profilePillClassName(variant: 'primary' | 'secondary', className?: string) {
  return hubPillClassName(
    variant,
    cx('focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text', className)
  );
}

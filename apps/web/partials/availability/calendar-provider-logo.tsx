import type { CalendarProvider } from '~/core/debates/api';

import { GoogleMark } from '~/design-system/icons/google-mark';
import { OutlookMark } from '~/design-system/icons/outlook-mark';

/** The provider's mark on its calendar chip. Decorative: the chip's text names the calendar. */
export function CalendarProviderLogo({ provider }: { provider: CalendarProvider }) {
  return provider === 'microsoft' ? <OutlookMark size={16} /> : <GoogleMark size={16} />;
}

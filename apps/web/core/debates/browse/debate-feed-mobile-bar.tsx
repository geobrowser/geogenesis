'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';
import { useSticky } from '~/core/hooks/use-sticky';

import { MobileNavbarBrand } from '~/partials/navbar/mobile-navbar-brand';

const NavbarAccountActions = dynamic(
  () => import('~/partials/navbar/navbar-account-actions').then(m => ({ default: m.NavbarAccountActions })),
  { ssr: false }
);

/**
 * The phone-only bar over the full-screen debate feed (GEO-3415). The feed covers the app navbar on
 * phones, which left a visitor from a shared link with no way to the rest of Geo and no way to sign
 * in. This is the minimum that fixes that: the Geo lockup to Explore, and the account controls.
 *
 * The lockup is the share video's: the same mark, and "Geo" in Geist Medium rather than Calibre, so a
 * screenshot of the feed carries the brand the way the video does.
 */
export function DebateFeedMobileBar() {
  // Leave desktop-only visits lazy, but keep an opened profile editor and any pending save alive
  // after a phone visit. CSS hides the bar on desktop; compact controls own no extra shortcuts.
  const isPhone = useIsPhoneLayout();
  const mountAccountActions = useSticky(isPhone);

  return (
    <header className="hidden h-11 shrink-0 items-center justify-between bg-white px-4 md:flex">
      <MobileNavbarBrand placement="debate_feed_bar" />
      {mountAccountActions ? <NavbarAccountActions compact placement="debate_feed_bar" /> : null}
    </header>
  );
}

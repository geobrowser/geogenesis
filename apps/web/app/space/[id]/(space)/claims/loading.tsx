import { SpaceTabLoadingRows } from '~/partials/space-page/space-tab-loading';

/**
 * Full-bleed, unlike the shared space-tab loading state: this route hides the space header and the
 * tab bar entirely (`FULL_BLEED_ROUTE` in `space-chrome-gate`).
 */
export default function Loading() {
  return <SpaceTabLoadingRows />;
}

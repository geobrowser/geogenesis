import { SpaceTabLoading } from '~/partials/space-page/space-tab-loading';

/**
 * Loading UI for space tabs that share the tab bar.
 *
 * Without a boundary, a tab click kept the previous content on screen until the server answered.
 * `claims` and `debates` are full-bleed and keep their own `loading.tsx`.
 */
export default function Loading() {
  return <SpaceTabLoading />;
}

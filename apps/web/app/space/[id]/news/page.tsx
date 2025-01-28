import { Tab } from '~/partials/tab/tab';

import type { PageProps } from '../types';

export default async function Page(props: PageProps) {
  return (
    <Tab slug="news" /* @next-codemod-error 'props' is used with spread syntax (...). Any asynchronous properties of 'props' must be awaited when accessed. */
    {...props} />
  );
}

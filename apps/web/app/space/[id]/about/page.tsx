import { Tab } from '~/partials/tab/tab';

import type { PageProps } from '../types';

export default async function Page(props: PageProps) {
  return <Tab slug="about" {...props} />;
}

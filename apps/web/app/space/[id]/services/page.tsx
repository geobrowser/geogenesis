import { Tab } from '~/partials/tab/tab';

import type { PageProps } from '../types';

export default async function Page(props: PageProps) {
  const params = await props.params;
  return <Tab slug="services" params={params} />;
}

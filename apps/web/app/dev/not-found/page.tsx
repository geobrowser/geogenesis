import { notFound } from 'next/navigation';

import Custom404 from '~/app/not-found';

export default function DevNotFoundPreview() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_PREVIEWS !== '1') {
    notFound();
  }

  return <Custom404 />;
}
